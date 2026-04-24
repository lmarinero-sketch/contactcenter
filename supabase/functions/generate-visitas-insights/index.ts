import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Actúa como un experto consultor de salud y analista de datos. Redacta un reporte ejecutivo tipo "revista de finanzas y negocios" de 3 párrafos analizando los datos de presentismo y ausentismo del Sanatorio Argentino que recibirás. Escribe con estilo sofisticado, muy profesional, periodístico y directivo. Enfócate en el impacto de los ausentes en la operación. Usa markdown básico (**negrita**). Devuelve solo el texto del artículo.`;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { data } = await req.json();

        if (!data) {
            return new Response(JSON.stringify({ error: "data payload is required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const userPrompt = `Analiza estos datos del dashboard de Turnos: ${JSON.stringify(data)}`;

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
                temperature: 0.7,
                max_tokens: 1500,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI error: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        const content = result.choices[0].message.content;

        return new Response(JSON.stringify({ content }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Report insights error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
