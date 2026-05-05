import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getTier(supabase: any, userId: string): Promise<"elder" | "candidate" | null> {
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

async function assertAccess(supabase: any, userId: string) {
  const tier = await getTier(supabase, userId);
  if (!tier) throw new Error("Forbidden: elder access required");
  return tier;
}

// Pastoral care
export const listPastoralCare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("pastoral_care_entries")
      .select("*")
      .order("date_added", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertPastoralEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        person_name: z.string().min(1).max(200),
        notes: z.string().max(10000).nullable().optional(),
        assigned_elder_id: z.string().uuid().nullable().optional(),
        status: z.enum(["active", "monitoring", "resolved"]).optional(),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    if (data.id) {
      const { id, ...patch } = data;
      const next: any = { ...patch };
      if (patch.status === "resolved") next.resolved_at = new Date().toISOString();
      const { error } = await supabaseAdmin.from("pastoral_care_entries").update(next).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("pastoral_care_entries")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deletePastoralEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin
      .from("pastoral_care_entries")
      .select("executive_session")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("pastoral_care_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPastoralUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entry_id: z.string().uuid(),
        body: z.string().min(1).max(10000),
        executive_session: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("pastoral_care_updates")
      .insert({ ...data, author_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPastoralUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entry_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("pastoral_care_updates")
      .select("*")
      .eq("entry_id", data.entry_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Archive
export const listArchive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("elder_meeting_archive")
      .select("id, meeting_date, meeting_type, title, summary, attendees, source")
      .order("meeting_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getArchiveEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("elder_meeting_archive")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const importArchiveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entries: z.array(
          z.object({
            meeting_date: z.string(),
            meeting_type: z.string().optional(),
            title: z.string().optional(),
            summary: z.string().optional(),
            body: z.string().optional(),
            attendees: z.array(z.string()).optional(),
            source: z.string().optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await getTier(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden: full elder required");
    const { error } = await supabaseAdmin
      .from("elder_meeting_archive")
      .insert(data.entries.map((e) => ({ ...e, imported_by: context.userId })));
    if (error) throw new Error(error.message);
    return { ok: true, count: data.entries.length };
  });
