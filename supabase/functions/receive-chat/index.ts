// Edge Function: receive-chat
// Recibe el webhook de AsisteClick, almacena en Supabase, y triggerea el procesamiento
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Helper: safely parse AsisteClick timestamps ─────────────────────
// AsisteClick sends timestamps as epoch milliseconds (number or numeric string)
function parseTimestamp(ts: any): Date | null {
  if (!ts) return null;
  // If it's a numeric string, convert to number
  const num = typeof ts === "string" ? Number(ts) : ts;
  if (!isNaN(num) && num > 1000000000) {
    // Epoch: if < 10 billion, assume seconds; otherwise milliseconds
    return new Date(num > 9999999999 ? num : num * 1000);
  }
  // Try ISO string
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Helper: detect human agent from messages ────────────────────────
// Scans all OUT messages to find sender names that are NOT in the bot list.
// Returns { humanAgentName, botHandoffSeconds, lastBotMsgTime, firstHumanMsgTime }
function detectHumanAgentFromMessages(
  messages: any[],
  botNames: Set<string>
): {
  humanAgentName: string | null;
  botHandoffSeconds: number | null;
  lastBotMsgTime: string | null;
  firstHumanMsgTime: string | null;
} {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      humanAgentName: null,
      botHandoffSeconds: null,
      lastBotMsgTime: null,
      firstHumanMsgTime: null,
    };
  }

  // Sort by timestamp
  const sorted = [...messages]
    .filter((m) => m.timestamp || m.message_timestamp)
    .sort((a, b) => {
      const ta = parseTimestamp(a.timestamp || a.message_timestamp)?.getTime() || 0;
      const tb = parseTimestamp(b.timestamp || b.message_timestamp)?.getTime() || 0;
      return ta - tb;
    });

  let lastBotMsgTime: string | null = null;
  let firstHumanMsgTime: string | null = null;
  let humanAgentName: string | null = null;

  for (const msg of sorted) {
    if (msg.action !== "OUT") continue;
    const senderName = msg.name || msg.sender_name || "";
    if (!senderName) continue;

    const isBot = botNames.has(senderName.toLowerCase());

    if (isBot) {
      // Track the last bot OUT message timestamp
      lastBotMsgTime = msg.timestamp || msg.message_timestamp;
    } else {
      // This is a human agent!
      if (!firstHumanMsgTime) {
        firstHumanMsgTime = msg.timestamp || msg.message_timestamp;
      }
      // Always take the LAST human sender as the assigned agent
      humanAgentName = senderName;
    }
  }

  // Calculate handoff time: last bot message → first human agent message
  let botHandoffSeconds: number | null = null;
  if (lastBotMsgTime && firstHumanMsgTime) {
    const botDate = parseTimestamp(lastBotMsgTime);
    const humanDate = parseTimestamp(firstHumanMsgTime);
    if (botDate && humanDate) {
      const diff = humanDate.getTime() - botDate.getTime();
      if (diff > 0) {
        botHandoffSeconds = Math.round(diff / 1000);
      }
    }
  }

  return { humanAgentName, botHandoffSeconds, lastBotMsgTime, firstHumanMsgTime };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received webhook for ticket:", payload.ticket_id);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Load known bot names from cc_agent_config
    const { data: agentConfig } = await supabase
      .from("cc_agent_config")
      .select("agent_name, role");

    const botNames = new Set(
      (agentConfig || [])
        .filter((a: any) => a.role === "bot")
        .map((a: any) => a.agent_name.toLowerCase())
    );

    // 2. Determine agent from payload header
    const payloadAgentName = payload.agent?.name || null;
    const isBotAgentHeader = payloadAgentName
      ? botNames.has(payloadAgentName.toLowerCase())
      : true;

    // 3. ★ DEEP SCAN: Analyze actual messages for human agent detection
    const messageDetection = detectHumanAgentFromMessages(
      payload.messages || [],
      botNames
    );

    // Final agent determination: messages take priority over header
    const finalAgentName =
      messageDetection.humanAgentName || // Priority 1: detected from messages
      (!isBotAgentHeader ? payloadAgentName : null); // Priority 2: from payload header

    const hasHumanAgent = finalAgentName !== null;
    const wasTransferred = hasHumanAgent;

    console.log(
      `Agent mapping: header="${payloadAgentName}" → ${isBotAgentHeader ? "BOT" : "HUMAN"} | ` +
      `messages="${messageDetection.humanAgentName}" | ` +
      `final="${finalAgentName || "Bot only"}" | ` +
      `handoff=${messageDetection.botHandoffSeconds ?? "N/A"}s`
    );

    // 4. Auto-register new human agents
    if (finalAgentName) {
      const knownNames = new Set(
        (agentConfig || []).map((a: any) => a.agent_name.toLowerCase())
      );
      if (!knownNames.has(finalAgentName.toLowerCase())) {
        await supabase.from("cc_agent_config").upsert(
          {
            agent_name: finalAgentName,
            role: "human",
            display_name: finalAgentName,
          },
          { onConflict: "agent_name" }
        );
        console.log(`New human agent registered: ${finalAgentName}`);
      }
    }

    // 5. Build ticket data
    const ticketData: Record<string, any> = {
      ticket_id: payload.ticket_id,
      channel: payload.channel || "WEB",
      source: payload.source || "CHAT",
      status: payload.status || "UNKNOWN",
      subject: payload.subject || "",

      // Bot
      bot_id: payload.bot?.id || null,
      bot_name: payload.bot?.name || null,
      transferred_to_agent: wasTransferred,

      // Department
      department_id: payload.department?.id || null,
      department_name: payload.department?.name || null,

      // Agent — set from deep scan or header
      agent_id: hasHumanAgent ? (payload.agent?.id || null) : null,
      agent_name: finalAgentName,
      agent_email: hasHumanAgent ? (payload.agent?.email || null) : null,

      // Customer
      customer_fingerprint: payload.customer?.fingerprint || null,
      customer_name: payload.customer?.name || null,
      customer_email: payload.customer?.email || null,
      customer_phone: payload.customer?.phone || null,
      customer_country_code: payload.customer?.country_code || null,
      customer_country_name: payload.customer?.country_name || null,
      customer_browser_os: payload.customer?.browser_os || null,
      customer_ip: payload.customer?.ip || null,
      customer_sentiment: payload.customer?.sentiment || null,

      // Event
      event_locale: payload.event?.customer_locale || null,
      event_timezone: payload.event?.customer_timezone || null,
      event_location: payload.event?.location || null,
      event_status: payload.event?.event_status || null,

      // Timestamp
      chat_started_at: payload.timestamp
        ? (parseTimestamp(payload.timestamp)?.toISOString() || new Date().toISOString())
        : new Date().toISOString(),

      // Bot handoff timing
      bot_handoff_seconds: messageDetection.botHandoffSeconds,

      // Raw backup
      raw_payload: payload,
    };

    // 6. Upsert ticket — NEVER downgrade from human agent to bot
    const { data: existingTicket } = await supabase
      .from("cc_tickets")
      .select("agent_name, agent_id, transferred_to_agent")
      .eq("ticket_id", payload.ticket_id)
      .maybeSingle();

    // If this ticket already has a human agent and current detection found none, preserve it
    if (existingTicket?.agent_name && !hasHumanAgent) {
      console.log(
        `Preserving existing human agent "${existingTicket.agent_name}" (current webhook has no human)`
      );
      ticketData.agent_name = existingTicket.agent_name;
      ticketData.agent_id = existingTicket.agent_id;
      ticketData.transferred_to_agent = existingTicket.transferred_to_agent;
    }

    const { error: ticketError } = await supabase
      .from("cc_tickets")
      .upsert(ticketData, { onConflict: "ticket_id" });

    if (ticketError) {
      console.error("Error inserting ticket:", ticketError);
      return new Response(JSON.stringify({ error: ticketError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Insert messages
    if (payload.messages && Array.isArray(payload.messages)) {
      await supabase
        .from("cc_messages")
        .delete()
        .eq("ticket_id", payload.ticket_id);

      const messagesData = payload.messages.map(
        (msg: any, index: number) => ({
          ticket_id: payload.ticket_id,
          action: msg.action,
          sender_name: msg.name || "Unknown",
          message: msg.message || "",
          message_timestamp: msg.timestamp
            ? (parseTimestamp(msg.timestamp)?.toISOString() || null)
            : null,
          message_order: index + 1,
        })
      );

      const { error: msgError } = await supabase
        .from("cc_messages")
        .insert(messagesData);

      if (msgError) {
        console.error("Error inserting messages:", msgError);
      }
    }

    // 8. Trigger async analysis
    const processUrl = `${SUPABASE_URL}/functions/v1/process-chat`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ ticket_id: payload.ticket_id }),
    }).catch((err) => console.error("Failed to trigger process-chat:", err));

    console.log("Ticket stored successfully:", payload.ticket_id);

    return new Response(
      JSON.stringify({
        success: true,
        ticket_id: payload.ticket_id,
        messages_count: payload.messages?.length || 0,
        agent: finalAgentName || "Bot",
        transferred: wasTransferred,
        bot_handoff_seconds: messageDetection.botHandoffSeconds,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
