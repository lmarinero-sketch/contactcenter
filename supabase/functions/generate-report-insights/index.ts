// Edge Function: generate-report-insights
// Generates AI-powered narrative analysis for Contact Center PDF reports
// Uses GPT-4o-mini for cost-efficient, high-quality structured output
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres un analista senior de Contact Center del Sanatorio Argentino (clínica médica en Argentina).
Tu trabajo es generar un informe de gestión NARRATIVO basándote en datos cuantitativos del Contact Center.

REGLAS:
- Escribe en español argentino profesional (vos/ustedes, no tú).
- Sé conciso pero con profundidad analítica.
- Usa datos concretos del JSON que recibís para respaldar cada punto.
- Mencioná porcentajes, cantidades y comparativas cuando sea posible.
- Las recomendaciones deben ser ACCIONABLES y específicas al contexto hospitalario.
- NO inventes datos que no estén en el JSON.
- El markdown soportado es solo **negrita** para enfatizar.
- Cada sección debe tener 2-5 oraciones ricas en contenido.

Devuelve SOLO JSON válido con esta estructura exacta (sin markdown, sin texto adicional):
{
  "title": "string - título del informe",
  "generatedAt": "string - ISO date",
  "sections": [
    {
      "title": "string - título con emoji relevante",
      "content": "string - contenido narrativo rico con **negrita** para datos clave"
    }
  ]
}

SECCIONES REQUERIDAS (en este orden exacto):
1. 📊 Resumen Ejecutivo - Visión global con cifras principales
2. 👥 Análisis de Carga de Trabajo - Distribución entre agentes, concentración, equilibrio
3. 😊 Análisis de Sentimiento - Tasas positivas/negativas, tendencia, alertas
4. ⚠️ Chats Problemáticos - Cantidad, causas principales, impacto
5. 🕐 Patrones Temporales - Horas pico, días de mayor demanda, implicancias para dotación
6. 💡 Recomendaciones - 3-5 acciones concretas priorizadas para mejorar la operación`;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { data } = await req.json();

        if (!data) {
            return new Response(
                JSON.stringify({ error: "data payload is required" }),
                {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        console.log("Generating report insights for:", data.agente, "period:", data.periodo);

        const userPrompt = `Generá un informe de gestión narrativo basado en estos datos reales del Contact Center:

${JSON.stringify(data, null, 2)}

NOTAS CONTEXTUALES:
- "Sentimiento promedio" va de -1 (muy negativo) a +1 (muy positivo). 0 es neutro.
- "Resolución Bot" indica el % de consultas que el bot resuelve sin derivar a un agente humano.
- "Variación semanal" compara la semana actual vs la anterior.
- El Contact Center atiende consultas de pacientes de un sanatorio médico.
- Los agentes son operadores humanos que atienden vía chat (AsisteClick/WhatsApp).

Generá el informe completo en JSON. Cada sección debe ser sustancial (no genérica).`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.5,
                max_tokens: 2500,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI error: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        const content = result.choices[0].message.content;
        const insights = JSON.parse(content);
        const tokensUsed = result.usage?.total_tokens || 0;

        console.log(`Report insights generated, tokens: ${tokensUsed}`);

        return new Response(
            JSON.stringify(insights),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (error) {
        console.error("Report insights error:", error);
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
