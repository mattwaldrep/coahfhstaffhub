import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Authenticate the caller
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!anonKey) throw new Error("SUPABASE_ANON_KEY not configured");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    // Build live context from the hub via service role
    const admin = createClient(supabaseUrl, serviceKey);
    const today = new Date().toISOString().slice(0, 10);
    const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();

    const [meetingRes, agendaRes, actionsRes, eventsRes, reviewsRes] = await Promise.all([
      admin.from("meetings").select("*").eq("meeting_date", today).maybeSingle(),
      admin
        .from("agenda_items")
        .select("title,status,owner_name")
        .order("position")
        .limit(40),
      admin
        .from("action_items")
        .select("title,completed,due_date")
        .eq("completed", false)
        .order("created_at", { ascending: false })
        .limit(40),
      admin
        .from("calendar_events")
        .select("title,start_at,sub_calendar,leader_name,location")
        .gte("start_at", new Date().toISOString())
        .lte("start_at", sevenDays)
        .order("start_at")
        .limit(40),
      admin
        .from("sunday_reviews")
        .select("*")
        .order("service_date", { ascending: false })
        .limit(4),
    ]);

    const context = {
      todays_meeting: meetingRes.data,
      agenda_items: agendaRes.data,
      open_action_items: actionsRes.data,
      next_7_days_events: eventsRes.data,
      recent_sunday_reviews: reviewsRes.data,
    };

    const systemPrompt = `You are the COAH Staff Hub assistant for City on a Hill Forest Hills church staff. Be warm, concise, and pastoral in tone. Answer using the LIVE CONTEXT below when relevant. If asked about something outside the context, say so plainly. Format with short paragraphs and bullets.

LIVE CONTEXT (JSON):
${JSON.stringify(context, null, 2)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
