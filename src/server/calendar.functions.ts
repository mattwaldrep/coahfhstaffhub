import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyCycleOpen, notifySubmissionReady } from "./calendar-notifications.server";

async function isCore(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  return !!data;
}

async function assertCore(supabase: any, userId: string) {
  if (!(await isCore(supabase, userId))) throw new Error("Forbidden: core role required");
}

const SUB_CALS = ["forest_hills_main", "coah_lm", "youth", "general"] as const;
const subCalSchema = z.enum(SUB_CALS);

const proposedEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  sub_calendar: subCalSchema,
  start_at: z.string().min(1),
  end_at: z.string().nullable().optional(),
  all_day: z.boolean().default(false),
  category: z.string().max(100).nullable().optional(),
  leader_name: z.string().max(255).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  room_needed: z.string().max(255).nullable().optional(),
  action_note: z.string().max(2000).nullable().optional(),
  pco_registration: z.boolean().default(false),
  missions_team_needed: z.boolean().default(false),
  church_covering: z.string().max(255).nullable().optional(),
  other_listings: z.array(z.string().max(255)).max(20).default([]),
  social_ads: z.boolean().default(false),
  room_not_needed: z.boolean().default(false),
  leader_not_needed: z.boolean().default(false),
});

// ---------- Cycles ----------

export const listPlanningCycles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_planning_cycles")
      .select("*")
      .order("plan_year", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getActiveCycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("calendar_planning_cycles")
      .select("*")
      .in("status", ["open", "review"])
      .order("plan_year", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

export const createPlanningCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      plan_year: z.number().int().min(2024).max(2100),
      title: z.string().min(1).max(255),
      opens_at: z.string(),
      closes_at: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("calendar_planning_cycles")
      .insert({ ...data, created_by: context.userId, status: "open" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    try { await notifyCycleOpen(row); } catch (e) { console.error("notifyCycleOpen failed", e); }
    return row;
  });

export const updatePlanningCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(255).optional(),
      opens_at: z.string().optional(),
      closes_at: z.string().optional(),
      status: z.enum(["open", "review", "closed"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("calendar_planning_cycles")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Submissions ----------

export const listSubmissionsForCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cycle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: subs, error } = await context.supabase
      .from("calendar_plan_submissions")
      .select("*, leader:profiles!leader_id(full_name, email)")
      .eq("cycle_id", data.cycle_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return subs ?? [];
  });

export const getSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: sub, error: e1 }, { data: events, error: e2 }] = await Promise.all([
      context.supabase
        .from("calendar_plan_submissions")
        .select("*, leader:profiles!leader_id(full_name, email)")
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("calendar_proposed_events")
        .select("*")
        .eq("submission_id", data.id)
        .order("start_at", { ascending: true }),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return { submission: sub, events: events ?? [] };
  });

export const createSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      cycle_id: z.string().uuid(),
      sub_calendar: subCalSchema,
      title: z.string().max(255).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("calendar_plan_submissions")
      .insert({
        cycle_id: data.cycle_id,
        sub_calendar: data.sub_calendar,
        title: data.title ?? null,
        leader_id: context.userId,
        status: "draft",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const submitSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_plan_submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    try { await notifySubmissionReady(data.id); } catch (e) { console.error("notifySubmissionReady failed", e); }
    return { ok: true };
  });

export const deleteSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_plan_submissions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Proposed events ----------

export const addProposedEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ submission_id: z.string().uuid(), event: proposedEventSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("calendar_proposed_events")
      .insert({ submission_id: data.submission_id, ...data.event })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateProposedEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), event: proposedEventSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_proposed_events")
      .update(data.event)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProposedEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_proposed_events")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// All proposed events from submitted plans in a cycle (for silo-busting view)
export const listVisibleProposedEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cycle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: subs } = await context.supabase
      .from("calendar_plan_submissions")
      .select("id, leader_id, sub_calendar, status, leader:profiles!leader_id(full_name)")
      .eq("cycle_id", data.cycle_id)
      .neq("status", "draft");
    const subIds = (subs ?? []).map((s: any) => s.id);
    if (subIds.length === 0) return { events: [], submissions: subs ?? [] };
    const { data: events } = await context.supabase
      .from("calendar_proposed_events")
      .select("*")
      .in("submission_id", subIds)
      .order("start_at", { ascending: true });
    return { events: events ?? [], submissions: subs ?? [] };
  });

// ---------- Reviewer actions ----------

export const reviewProposedEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      reviewer_note: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);

    // Fetch the proposed event
    const { data: prop, error: pErr } = await supabaseAdmin
      .from("calendar_proposed_events")
      .select("*")
      .eq("id", data.id)
      .single();
    if (pErr || !prop) throw new Error(pErr?.message ?? "Not found");

    let approved_event_id: string | null = prop.approved_event_id ?? null;

    if (data.decision === "approved" && !approved_event_id) {
      const { data: ev, error: insErr } = await supabaseAdmin
        .from("calendar_events")
        .insert({
          title: prop.title,
          description: prop.description,
          sub_calendar: prop.sub_calendar,
          start_at: prop.start_at,
          end_at: prop.end_at,
          all_day: prop.all_day,
          category: prop.category,
          leader_name: prop.leader_name,
          location: prop.location,
          room_needed: prop.room_needed,
          action_note: prop.action_note,
          pco_registration: prop.pco_registration,
          missions_team_needed: prop.missions_team_needed,
          church_covering: prop.church_covering,
          other_listings: prop.other_listings ?? [],
          social_ads: (prop as any).social_ads ?? false,
          room_not_needed: prop.room_not_needed ?? false,
          leader_not_needed: prop.leader_not_needed ?? false,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      approved_event_id = ev.id;
    }

    if (data.decision === "rejected" && approved_event_id) {
      // If previously approved then later rejected, remove the published event.
      await supabaseAdmin.from("calendar_events").delete().eq("id", approved_event_id);
      approved_event_id = null;
    }

    const { error: uErr } = await supabaseAdmin
      .from("calendar_proposed_events")
      .update({
        status: data.decision,
        reviewer_note: data.reviewer_note ?? null,
        approved_event_id,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    return { ok: true };
  });

export const finalizeSubmissionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      submission_id: z.string().uuid(),
      reviewer_note: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);

    const { data: events } = await supabaseAdmin
      .from("calendar_proposed_events")
      .select("status")
      .eq("submission_id", data.submission_id);

    const total = events?.length ?? 0;
    const approved = events?.filter((e: any) => e.status === "approved").length ?? 0;
    const rejected = events?.filter((e: any) => e.status === "rejected").length ?? 0;

    let status: "approved" | "rejected" | "partially_approved" | "in_review" = "in_review";
    if (total > 0 && approved === total) status = "approved";
    else if (total > 0 && rejected === total) status = "rejected";
    else if (approved > 0) status = "partially_approved";

    const { error } = await supabaseAdmin
      .from("calendar_plan_submissions")
      .update({
        status,
        reviewer_id: context.userId,
        reviewer_note: data.reviewer_note ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.submission_id);
    if (error) throw new Error(error.message);

    return { ok: true, status };
  });

export const bulkReviewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      submission_id: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: events } = await supabaseAdmin
      .from("calendar_proposed_events")
      .select("id")
      .eq("submission_id", data.submission_id);
    for (const ev of events ?? []) {
      // reuse the single-event reviewer path
      const { data: full } = await supabaseAdmin
        .from("calendar_proposed_events")
        .select("*")
        .eq("id", ev.id)
        .single();
      if (!full) continue;
      let approved_event_id = full.approved_event_id;
      if (data.decision === "approved" && !approved_event_id) {
        const { data: ce } = await supabaseAdmin
          .from("calendar_events")
          .insert({
            title: full.title,
            description: full.description,
            sub_calendar: full.sub_calendar,
            start_at: full.start_at,
            end_at: full.end_at,
            all_day: full.all_day,
            category: full.category,
            leader_name: full.leader_name,
            location: full.location,
            room_needed: full.room_needed,
            action_note: full.action_note,
            pco_registration: full.pco_registration,
            missions_team_needed: full.missions_team_needed,
            church_covering: full.church_covering,
            other_listings: full.other_listings ?? [],
            room_not_needed: full.room_not_needed ?? false,
            leader_not_needed: full.leader_not_needed ?? false,
            created_by: context.userId,
          })
          .select("id")
          .single();
        approved_event_id = ce?.id ?? null;
      }
      if (data.decision === "rejected" && approved_event_id) {
        await supabaseAdmin.from("calendar_events").delete().eq("id", approved_event_id);
        approved_event_id = null;
      }
      await supabaseAdmin
        .from("calendar_proposed_events")
        .update({ status: data.decision, approved_event_id })
        .eq("id", ev.id);
    }
    return { ok: true };
  });
