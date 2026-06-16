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

    const [meetingRes, agendaRes, actionsRes, eventsRes, reviewsRes, elderMeetingsRes, motionsRes] = await Promise.all([
      admin.from("meetings").select("id,meeting_date,title").eq("meeting_date", today).maybeSingle(),
      admin
        .from("agenda_items")
        .select("id,title,status,owner_name,meeting_id")
        .order("position")
        .limit(40),
      admin
        .from("action_items")
        .select("id,title,completed,due_date,meeting_id")
        .eq("completed", false)
        .order("created_at", { ascending: false })
        .limit(40),
      admin
        .from("calendar_events")
        .select("id,title,start_at,sub_calendar,leader_name,location")
        .gte("start_at", new Date().toISOString())
        .lte("start_at", sevenDays)
        .order("start_at")
        .limit(40),
      admin
        .from("sunday_reviews")
        .select("id,service_date")
        .order("service_date", { ascending: false })
        .limit(4),
      admin
        .from("elder_meetings")
        .select("id,meeting_date,title")
        .order("meeting_date", { ascending: false })
        .limit(10),
      admin
        .from("elder_motions")
        .select("id,title,status,deadline_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Pull the caller's Google Tasks (all lists) if connected
    const googleTasks = await fetchGoogleTasksForUser(admin, userData.user.id).catch((e) => {
      console.error("google tasks fetch failed", e);
      return null;
    });

    const context = {
      todays_meeting: meetingRes.data,
      agenda_items: agendaRes.data,
      open_action_items: actionsRes.data,
      next_7_days_events: eventsRes.data,
      recent_sunday_reviews: reviewsRes.data,
      elder_meetings: elderMeetingsRes.data,
      elder_motions: motionsRes.data,
      my_google_tasks: googleTasks,
    };

    const systemPrompt = `You are the COAH Staff Hub assistant for City on a Hill Forest Hills church staff. Be warm, concise, and pastoral in tone. Answer using the LIVE CONTEXT below when relevant. If asked about something outside the context, say so plainly. Format with short paragraphs and bullets.

When you reference a specific item from the LIVE CONTEXT, link to it using Markdown links so the user can open it in the app. Use these path patterns (relative paths only, no domain):
- Staff meeting / agenda item / action item: [Title](/meeting) — the meeting page shows the current meeting; do not append query params
- Calendar event: [Title](/calendar?event=<calendar_events.id>) — note: the param is "event", not "eventId"
- Sunday review: [Service date](/sunday-review) — do not append query params
- Elder meeting: [Title](/elder/meetings/<elder_meetings.id>)
- Elder motion: [Title](/elder/motions/<elder_motions.id>)
- Google Task: [Title](<webViewLink>) — use the task's webViewLink (an absolute https://tasks.google.com URL); these open in Google Tasks, not in the hub
Always use relative paths starting with "/" for in-app items — never include a domain or "https://". Only link items that actually appear in the LIVE CONTEXT below. Never invent IDs. Prefer linking the item's name inline rather than dumping bare URLs.

When the user asks what they need to do today / this week, consider BOTH open_action_items assigned to them AND my_google_tasks (status = "needsAction"). Surface overdue items first.

When you reference a specific item from the LIVE CONTEXT, link to it using Markdown links so the user can open it in the app. Use these path patterns (relative paths only, no domain):
- Staff meeting / agenda item / action item: [Title](/meeting) — the meeting page shows the current meeting; do not append query params
- Calendar event: [Title](/calendar?event=<calendar_events.id>) — note: the param is "event", not "eventId"
- Sunday review: [Service date](/sunday-review) — do not append query params
- Elder meeting: [Title](/elder/meetings/<elder_meetings.id>)
- Elder motion: [Title](/elder/motions/<elder_motions.id>)
Always use relative paths starting with "/" — never include a domain or "https://". Only link items that actually appear in the LIVE CONTEXT below. Never invent IDs. Prefer linking the item's name inline rather than dumping bare URLs.

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

async function fetchGoogleTasksForUser(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: row } = await admin
    .from("user_integrations")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", "google_tasks")
    .maybeSingle();
  if (!row?.refresh_token) return null;

  let accessToken: string | null = row.access_token ?? null;
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (!accessToken || exp < Date.now() + 60_000) {
    const id = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!id || !secret) return null;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
      }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
    accessToken = j.access_token as string;
    const newExp = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
    await admin
      .from("user_integrations")
      .update({ access_token: accessToken, expires_at: newExp })
      .eq("user_id", userId)
      .eq("provider", "google_tasks");
  }

  const listsRes = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listsJson: any = await listsRes.json();
  if (!listsRes.ok) throw new Error(`lists failed: ${JSON.stringify(listsJson)}`);
  const lists: Array<{ id: string; title: string }> = listsJson.items ?? [];

  const out: any[] = [];
  for (const list of lists) {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`);
    url.searchParams.set("showCompleted", "false");
    url.searchParams.set("maxResults", "100");
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const j: any = await r.json();
    if (!r.ok) continue;
    for (const t of (j.items ?? []) as any[]) {
      out.push({
        title: t.title,
        notes: t.notes ?? null,
        due: t.due ?? null,
        status: t.status,
        listTitle: list.title,
        webViewLink: t.webViewLink ?? null,
      });
    }
  }
  return out;
}
