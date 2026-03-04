// Edge Function: process-chat
// Toma una conversación almacenada y la analiza con OpenAI GPT-4o-mini
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// El árbol del chatbot del Sanatorio Argentino
const BOT_TREE = {
    level1: {
        "A": "Turnos o Autorizaciones",
        "B": "Guardias",
        "C": "Otras consultas",
    },
    level2_A: {
        "A": "Solicitar turnos",
        "B": "Reprogramar o cancelar turnos",
        "C": "Autorizaciones",
        "D": "Chequeo preventivo",
        "E": "Programa prevenir",
        "F": "Información",
        "G": "Volver al menú anterior",
    },
    level3_A_A: {
        "A": "Turnos de consultas",
        "B": "Turnos de Tomografía, Ecografía, Mamografía, Densitometría y Rayos X",
        "C": "Volver al menú anterior",
    },
};

const SYSTEM_PROMPT = `Eres un analista experto de contact center para el Sanatorio Argentino (clínica médica en Argentina).
Tu trabajo es analizar conversaciones de chat entre clientes/pacientes y agentes humanos o bots, y devolver un análisis estructurado en JSON.

CONTEXTO DEL CHATBOT:
El chatbot presenta opciones al inicio de la conversación. El árbol conocido es:
- Nivel 1: A) Turnos o Autorizaciones, B) Guardias, C) Otras consultas
- Nivel 2 (si elige A): A) Solicitar turnos, B) Reprogramar/cancelar, C) Autorizaciones, D) Chequeo preventivo, E) Programa prevenir, F) Información, G) Volver
- Nivel 3 (si elige A>A): A) Turnos de consultas, B) Turnos de Tomografía/Ecografía/Mamografía/Densitometría/Rayos X, C) Volver

INSTRUCCIONES:
1. Analiza el TONO del agente (cordial, profesional, informal, brusco, empático)
2. Detecta la INTENCIÓN principal del cliente (turno, reclamo, consulta, autorización, información, emergencia, etc.)
3. Evalúa el SENTIMIENTO del cliente (positivo, neutral, negativo, frustrado)
4. Identifica el CAMINO del chatbot que eligió el paciente analizando los mensajes del bot y las respuestas del cliente
5. Extrae PALABRAS CLAVE relevantes
6. Genera un RESUMEN breve de la conversación
7. Sugiere MEJORAS si corresponde

IMPORTANTE sobre el camino del bot:
- Analiza los mensajes del bot para detectar cuándo presenta opciones
- Analiza la respuesta del cliente (puede ser "A", "B", la opción escrita, o un mensaje libre)
- Mapea cada elección al árbol conocido
- Si el cliente escribió un mensaje libre en lugar de elegir una opción, indícalo

Responde SIEMPRE con un JSON válido con esta estructura exacta (sin markdown, sin texto adicional):`;

const ANALYSIS_SCHEMA = `{
  "detected_intent": "string - intención principal detectada",
  "intent_confidence": 0.95,
  "category": "string - categoría general (turnos, guardias, consultas, reclamos, información, otro)",
  "subcategory": "string - subcategoría más específica",
  "overall_sentiment": "string - positive/neutral/negative/frustrated",
  "sentiment_score": 0.0,
  "agent_tone": "string - cordial/profesional/informal/brusco/empático",
  "agent_greeting": true,
  "agent_farewell": true,
  "agent_protocol_score": 8.5,
  "agent_response_quality": "string - breve evaluación de la calidad de respuesta",
  "bot_path_choices": ["string - opciones elegidas en orden"],
  "bot_path_depth": 2,
  "bot_resolution": false,
  "bot_first_choice": "string - primera opción elegida (ej: 'Turnos o Autorizaciones')",
  "bot_second_choice": "string o null - segunda opción elegida",
  "bot_third_choice": "string o null - tercera opción elegida",
  "customer_keywords": ["palabra1", "palabra2"],
  "agent_keywords": ["palabra1", "palabra2"],
  "conversation_summary": "string - resumen de 1-2 oraciones",
  "improvement_suggestions": ["sugerencia1"]
}`;

async function analyzeWithOpenAI(messages, ticketContext) {
    const formattedMessages = messages
        .sort((a, b) => a.message_order - b.message_order)
        .map((msg) => {
            const role = msg.action === "IN" ? "CLIENTE" : "BOT/AGENTE";
            return `[${msg.message_order}] (${role}) ${msg.sender_name}: "${msg.message}"`;
        })
        .join("\n");

    const userPrompt = `Analiza la siguiente conversación de chat:

**Ticket**: ${ticketContext.ticket_id}
**Canal**: ${ticketContext.channel}
**Departamento**: ${ticketContext.department_name || "No especificado"}
**Bot transferido a agente**: ${ticketContext.transferred_to_agent ? "Sí" : "No"}
**Agente humano**: ${ticketContext.agent_name || "No asignado"}
**Cliente**: ${ticketContext.customer_name || "Anónimo"}

**Mensajes** (${messages.length} total):
${formattedMessages}

Devuelve SOLAMENTE el JSON de análisis, sin markdown ni texto adicional.
${ANALYSIS_SCHEMA}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 1000,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const tokensUsed = data.usage?.total_tokens || 0;

    return {
        analysis: JSON.parse(content),
        tokensUsed,
    };
}

function calculateTimings(messages: any[], botNames: Set<string>) {
    const sorted = [...messages].sort((a, b) =>
        new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
    );

    // Separate OUT messages into bot vs human
    let lastBotOutTime: Date | null = null;
    let firstHumanOutTime: Date | null = null;
    let botMessageCount = 0;
    let humanAgentMessageCount = 0;

    for (const msg of sorted) {
        if (msg.action === "OUT") {
            const senderName = (msg.sender_name || "").toLowerCase();
            if (botNames.has(senderName)) {
                botMessageCount++;
                if (msg.message_timestamp) {
                    lastBotOutTime = new Date(msg.message_timestamp);
                }
            } else {
                humanAgentMessageCount++;
                if (!firstHumanOutTime && msg.message_timestamp) {
                    firstHumanOutTime = new Date(msg.message_timestamp);
                }
            }
        }
    }

    // First response time = time from last bot OUT message to first human agent OUT message
    // This represents how long the patient waited for a human after the bot finished
    let firstResponseTime: number | null = null;
    if (lastBotOutTime && firstHumanOutTime && firstHumanOutTime > lastBotOutTime) {
        firstResponseTime = Math.round(
            (firstHumanOutTime.getTime() - lastBotOutTime.getTime()) / 1000
        );
    }

    // Total conversation time
    const totalTime = sorted.length >= 2
        ? Math.round(
            (new Date(sorted[sorted.length - 1].message_timestamp).getTime() -
                new Date(sorted[0].message_timestamp).getTime()) / 1000
        )
        : null;

    const messageCount = messages.length;
    const customerMessageCount = messages.filter((m) => m.action === "IN").length;

    return {
        firstResponseTime,
        totalTime,
        messageCount,
        agentMessageCount: humanAgentMessageCount,
        customerMessageCount,
        botMessageCount,
    };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { ticket_id } = await req.json();

        if (!ticket_id) {
            return new Response(
                JSON.stringify({ error: "ticket_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log("Processing ticket:", ticket_id);

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Check if already analyzed
        const { data: existingAnalysis } = await supabase
            .from("cc_analysis")
            .select("id")
            .eq("ticket_id", ticket_id)
            .single();

        if (existingAnalysis) {
            console.log("Ticket already analyzed:", ticket_id);
            return new Response(
                JSON.stringify({ success: true, message: "Already analyzed" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get ticket data
        const { data: ticket, error: ticketError } = await supabase
            .from("cc_tickets")
            .select("*")
            .eq("ticket_id", ticket_id)
            .single();

        if (ticketError || !ticket) {
            throw new Error(`Ticket not found: ${ticket_id}`);
        }

        // Get messages
        const { data: messages, error: msgError } = await supabase
            .from("cc_messages")
            .select("*")
            .eq("ticket_id", ticket_id)
            .order("message_order", { ascending: true });

        if (msgError || !messages || messages.length === 0) {
            throw new Error(`No messages found for ticket: ${ticket_id}`);
        }

        // Load bot names for accurate timing calculations
        const { data: agentConfig } = await supabase
            .from("cc_agent_config")
            .select("agent_name, role");

        const botNames = new Set(
            (agentConfig || [])
                .filter((a: any) => a.role === "bot")
                .map((a: any) => (a.agent_name as string).toLowerCase())
        );

        // Calculate timings (with bot/human distinction)
        const timings = calculateTimings(messages, botNames);

        // Analyze with OpenAI
        const { analysis, tokensUsed } = await analyzeWithOpenAI(messages, ticket);

        // Store analysis
        const analysisRecord = {
            ticket_id,
            detected_intent: analysis.detected_intent,
            intent_confidence: analysis.intent_confidence,
            category: analysis.category,
            subcategory: analysis.subcategory,
            overall_sentiment: analysis.overall_sentiment,
            sentiment_score: analysis.sentiment_score,
            agent_tone: analysis.agent_tone,
            agent_greeting: analysis.agent_greeting,
            agent_farewell: analysis.agent_farewell,
            agent_protocol_score: analysis.agent_protocol_score,
            agent_response_quality: analysis.agent_response_quality,
            bot_path_choices: analysis.bot_path_choices || [],
            bot_path_depth: analysis.bot_path_depth || 0,
            bot_resolution: analysis.bot_resolution || false,
            bot_first_choice: analysis.bot_first_choice || null,
            bot_second_choice: analysis.bot_second_choice || null,
            bot_third_choice: analysis.bot_third_choice || null,
            customer_keywords: analysis.customer_keywords || [],
            agent_keywords: analysis.agent_keywords || [],
            first_response_time_seconds: timings.firstResponseTime,
            total_resolution_time_seconds: timings.totalTime,
            message_count: timings.messageCount,
            agent_message_count: timings.agentMessageCount,
            customer_message_count: timings.customerMessageCount,
            bot_message_count: timings.botMessageCount,
            conversation_summary: analysis.conversation_summary,
            improvement_suggestions: analysis.improvement_suggestions || [],
            model_used: "gpt-4o-mini",
            tokens_used: tokensUsed,
        };

        const { error: insertError } = await supabase
            .from("cc_analysis")
            .insert(analysisRecord);

        if (insertError) {
            console.error("Error storing analysis:", insertError);
            throw new Error(`Failed to store analysis: ${insertError.message}`);
        }

        console.log("Analysis complete for ticket:", ticket_id, "Tokens used:", tokensUsed);

        return new Response(
            JSON.stringify({
                success: true,
                ticket_id,
                tokens_used: tokensUsed,
                sentiment: analysis.overall_sentiment,
                intent: analysis.detected_intent,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Processing error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
