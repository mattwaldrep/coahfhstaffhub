import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getElderTier(supabase: any, userId: string): Promise<"elder" | "candidate" | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["elder", "elder_candidate"]);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("elder")) return "elder";
  if (roles.includes("elder_candidate")) return "candidate";
  return null;
}

async function assertElderAccess(supabase: any, userId: string) {
  const tier = await getElderTier(supabase, userId);
  if (!tier) throw new Error("Forbidden: elder access required");
  return tier;
}

async function assertFullElder(supabase: any, userId: string) {
  const tier = await getElderTier(supabase, userId);
  if (tier !== "elder") throw new Error("Forbidden: full elder access required");
}

// ---------- Meetings ----------

export const listElderMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("elder_meetings")
      .select("id, meeting_date, meeting_type, title, status, location, completed_at, created_at")
      .order("meeting_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getElderMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const sb = context.supabase;
    const [meeting, attendees, agenda, notes, actions, joint] = await Promise.all([
      sb.from("elder_meetings").select("*").eq("id", data.id).maybeSingle(),
      sb.from("elder_meeting_attendees").select("*").eq("meeting_id", data.id),
      sb.from("elder_agenda_items").select("*").eq("meeting_id", data.id).order("position"),
      sb.from("elder_section_notes").select("*").eq("meeting_id", data.id),
      sb.from("elder_action_items").select("*").eq("meeting_id", data.id).order("created_at"),
      sb.from("elder_joint_deacon_items").select("*").eq("meeting_id", data.id).order("position"),
    ]);
    if (!meeting.data) throw new Error("Meeting not found");
    return {
      meeting: meeting.data,
      attendees: attendees.data ?? [],
      agenda: agenda.data ?? [],
      sectionNotes: notes.data ?? [],
      actionItems: actions.data ?? [],
      jointItems: joint.data ?? [],
    };
  });

export const createElderMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meeting_date: z.string(),
        meeting_type: z.enum(["standard", "joint"]),
        title: z.string().min(1).max(200).optional(),
        location: z.string().max(200).optional(),
        start_time: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);

    // Pull carry-forward sources: open action items, seed items, and prior meeting agenda
    const [openActions, seedItems, priorMeeting] = await Promise.all([
      supabaseAdmin
        .from("elder_action_items")
        .select("id, title, executive_session")
        .eq("completed", false),
      supabaseAdmin
        .from("elder_next_meeting_seed")
        .select("*")
        .is("consumed_meeting_id", null),
      supabaseAdmin
        .from("elder_meetings")
        .select("id")
        .eq("meeting_type", data.meeting_type)
        .lte("meeting_date", data.meeting_date)
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let priorAgenda: any[] = [];
    if (priorMeeting.data?.id) {
      const { data: pa } = await supabaseAdmin
        .from("elder_agenda_items")
        .select("title, body, executive_session, section_key, carry_to_next, position")
        .eq("meeting_id", priorMeeting.data.id)
        .or("section_key.eq.new_business,carry_to_next.eq.true")
        .order("position", { ascending: true });
      priorAgenda = pa ?? [];
    }

    const { data: created, error } = await supabaseAdmin
      .from("elder_meetings")
      .insert({
        meeting_date: data.meeting_date,
        meeting_type: data.meeting_type,
        title: data.title ?? (data.meeting_type === "joint" ? "Joint Elder/Deacon Meeting" : "Elder Meeting"),
        location: data.location ?? null,
        start_time: data.start_time ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Carry forward seed items into agenda
    if (seedItems.data && seedItems.data.length) {
      const inserts = seedItems.data.map((s, i) => ({
        meeting_id: created.id,
        section_key: s.section_key,
        position: i,
        title: s.title,
        body: s.body,
        executive_session: s.executive_session,
        source: "seed",
        created_by: context.userId,
      }));
      await supabaseAdmin.from("elder_agenda_items").insert(inserts);
      await supabaseAdmin
        .from("elder_next_meeting_seed")
        .update({ consumed_meeting_id: created.id })
        .in(
          "id",
          seedItems.data.map((s) => s.id),
        );
    }

    // Build follow-up section from open action items + prior new business / flagged items
    const followUpInserts: any[] = [];
    const seenTitles = new Set<string>();
    const pushFollowUp = (row: { title: string; body?: string | null; executive_session?: boolean }) => {
      const key = (row.title || "").trim().toLowerCase();
      if (!key || seenTitles.has(key)) return;
      seenTitles.add(key);
      followUpInserts.push({
        meeting_id: created.id,
        section_key: "follow_up",
        position: followUpInserts.length,
        title: row.title,
        body: row.body ?? null,
        executive_session: row.executive_session ?? false,
        source: "carryover",
        created_by: context.userId,
      });
    };
    (openActions.data ?? []).forEach((a) => pushFollowUp({ title: a.title, executive_session: a.executive_session }));
    priorAgenda.forEach((a) =>
      pushFollowUp({ title: a.title, body: a.body, executive_session: a.executive_session }),
    );
    if (followUpInserts.length) {
      await supabaseAdmin.from("elder_agenda_items").insert(followUpInserts);
    }

    return created;
  });

export const updateElderMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(200).optional(),
        meeting_date: z.string().optional(),
        location: z.string().max(200).nullable().optional(),
        start_time: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["draft", "in_progress", "complete", "archived"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { id, ...patch } = data;
    const next: any = { ...patch };
    if (patch.status === "complete") next.completed_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("elder_meetings").update(next).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteElderMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("elder_meetings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Agenda items ----------

export const upsertAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        meeting_id: z.string().uuid(),
        section_key: z.string(),
        title: z.string().min(1).max(500),
        body: z.string().max(10000).nullable().optional(),
        position: z.number().int().optional(),
        status: z.enum(["open", "done", "tabled"]).optional(),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") {
      throw new Error("Only full elders can mark Executive Session");
    }
    if (data.id) {
      // Check existing exec status
      const { data: existing } = await supabaseAdmin
        .from("elder_agenda_items")
        .select("executive_session")
        .eq("id", data.id)
        .maybeSingle();
      if (existing?.executive_session && tier !== "elder") {
        throw new Error("Forbidden");
      }
      const { id, ...patch } = data;
      const { error } = await supabaseAdmin.from("elder_agenda_items").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("elder_agenda_items")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteAgendaItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("elder_agenda_items")
      .select("executive_session")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("elder_agenda_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAgendaExecutive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), executive: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("elder_agenda_items")
      .update({ executive_session: data.executive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAgendaCarryToNext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), carry: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("elder_agenda_items")
      .update({ carry_to_next: data.carry })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Section notes ----------

export const saveSectionNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meeting_id: z.string().uuid(),
        section_key: z.string(),
        notes: z.string().max(20000),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("elder_section_notes")
      .upsert(data, { onConflict: "meeting_id,section_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Action items ----------

export const createElderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meeting_id: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(500),
        notes: z.string().max(10000).nullable().optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        due_date: z.string().nullable().optional(),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { data: created, error } = await supabaseAdmin
      .from("elder_action_items")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateElderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(500).optional(),
        notes: z.string().max(10000).nullable().optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        due_date: z.string().nullable().optional(),
        completed: z.boolean().optional(),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("elder_action_items")
      .select("executive_session")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.executive_session && tier !== "elder") throw new Error("Forbidden");
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("elder_action_items").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteElderAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("elder_action_items")
      .select("executive_session")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("elder_action_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Joint deacon items ----------

export const upsertJointItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        meeting_id: z.string().uuid(),
        sub_section: z.enum(["need_to_know", "resource", "upcoming"]),
        title: z.string().min(1).max(500),
        body: z.string().max(10000).nullable().optional(),
        position: z.number().int().optional(),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await supabaseAdmin.from("elder_joint_deacon_items").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("elder_joint_deacon_items")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteJointItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("elder_joint_deacon_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Attendees ----------

export const setAttendees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meeting_id: z.string().uuid(),
        attendees: z.array(
          z.object({
            user_id: z.string().uuid(),
            attendee_kind: z.enum(["elder", "candidate"]),
            present: z.boolean().optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);
    await supabaseAdmin.from("elder_meeting_attendees").delete().eq("meeting_id", data.meeting_id);
    if (data.attendees.length) {
      const { error } = await supabaseAdmin
        .from("elder_meeting_attendees")
        .insert(data.attendees.map((a) => ({ ...a, meeting_id: data.meeting_id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Elder users (for assignment dropdowns) ----------

export const listEldersAndCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["elder", "elder_candidate"]);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({
      ...p,
      tier: (roleMap.get(p.id) ?? []).includes("elder") ? "elder" : "candidate",
    }));
  });

// ---------- Push elder action item to Google Tasks ----------

import { pushActionItemToGoogleTasks } from "./google-tasks.functions";

export const pushElderActionToGoogleTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actionItemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    const { data: item } = await supabaseAdmin
      .from("elder_action_items")
      .select("*")
      .eq("id", data.actionItemId)
      .maybeSingle();
    if (!item) throw new Error("Not found");
    if (item.executive_session) {
      // Only push if assignee is full elder
      if (!item.assignee_id) throw new Error("No assignee");
      const { data: assigneeRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", item.assignee_id);
      const isElder = (assigneeRoles ?? []).some((r) => r.role === "elder");
      if (!isElder) throw new Error("Cannot push Executive Session item to a non-elder");
    }
    if (tier !== "elder" && item.executive_session) throw new Error("Forbidden");

    const targetUser = item.assignee_id ?? context.userId;
    // Reuse the helper logic via a direct call against Google
    const accessToken = await ensureAccessTokenInline(targetUser);
    const body: Record<string, any> = { title: item.title };
    if (item.notes) body.notes = item.notes;
    if (item.due_date) body.due = `${item.due_date}T00:00:00.000Z`;
    const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(`Google Tasks API error: ${JSON.stringify(result)}`);
    await supabaseAdmin
      .from("elder_action_items")
      .update({
        google_task_id: result.id,
        google_task_pushed_at: new Date().toISOString(),
        google_task_pushed_by: context.userId,
      })
      .eq("id", item.id);
    return { ok: true, taskId: result.id };
  });

// Local copy of token helper to avoid cross-importing private symbol
async function ensureAccessTokenInline(userId: string): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google_tasks")
    .maybeSingle();
  if (!row) throw new Error("User has not connected Google Tasks");
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + 60_000) return row.access_token;
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
  const newExpires = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("user_integrations")
    .update({ access_token: data.access_token, expires_at: newExpires })
    .eq("user_id", userId)
    .eq("provider", "google_tasks");
  return data.access_token as string;
}

void pushActionItemToGoogleTasks;

// ---------- Mentions ----------

/** Users available for @-mention: anyone with elder or elder_candidate role. */
export const listMentionableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["elder", "elder_candidate"]);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return (profs ?? []).map((p: any) => ({
      id: p.id,
      name: (p.full_name ?? p.email ?? "Unknown").trim(),
      email: p.email ?? null,
    }));
  });

/** Create action items for a list of mentions, deduping against existing ones for the same meeting/assignee/title. */
export const createActionsFromMentions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meeting_id: z.string().uuid(),
        executive_session: z.boolean().optional(),
        mentions: z
          .array(
            z.object({
              assignee_id: z.string().uuid(),
              title: z.string().min(1).max(500),
            }),
          )
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertElderAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");

    if (data.mentions.length === 0) return { created: 0 };

    // Pull existing action items for this meeting to dedup
    const { data: existing } = await supabaseAdmin
      .from("elder_action_items")
      .select("title, assignee_id")
      .eq("meeting_id", data.meeting_id);
    const have = new Set(
      (existing ?? []).map((r: any) => `${r.assignee_id ?? ""}::${(r.title ?? "").trim().toLowerCase()}`),
    );

    const rows = data.mentions
      .filter((m) => !have.has(`${m.assignee_id}::${m.title.trim().toLowerCase()}`))
      .map((m) => ({
        meeting_id: data.meeting_id,
        title: m.title.trim(),
        assignee_id: m.assignee_id,
        executive_session: !!data.executive_session,
        created_by: context.userId,
      }));

    if (rows.length === 0) return { created: 0 };

    const { error } = await supabaseAdmin.from("elder_action_items").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length };
  });

