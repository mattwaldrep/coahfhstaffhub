import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

async function assertCoreOrMeeting(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["core", "meeting"]);
  if (!data || data.length === 0) throw new Error("Forbidden: core or meeting role required");
}

async function assertCore(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: core role required");
}

export const getPcoServicesConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("pco_services_config")
      .select("sunday_service_type_id, updated_at")
      .eq("id", true)
      .maybeSingle();
    return { sunday_service_type_id: (data?.sunday_service_type_id ?? null) as string | null };
  });

export const savePcoServicesConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sunday_service_type_id: z.string().trim().max(64).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const v = data.sunday_service_type_id?.trim() || null;
    const { error } = await supabaseAdmin
      .from("pco_services_config")
      .upsert({ id: true, sunday_service_type_id: v }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testPcoServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("pco_services_config")
      .select("sunday_service_type_id")
      .eq("id", true)
      .maybeSingle();
    const id = cfg?.sunday_service_type_id;
    if (!id) return { ok: false as const, error: "No Service Type ID configured" };
    try {
      const { getServiceType } = await import("@/server/pco-services.server");
      const st = await getServiceType(id);
      return { ok: true as const, name: st.name };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "PCO call failed" };
    }
  });

const SLOT_TITLES: Record<string, string> = {
  ministry_highlight: "Ministry Highlight",
  announcement_1: "Announcement 1",
  announcement_2: "Announcement 2",
  core_value_highlight: "Core Value Highlight",
};

export type PushSlotResult = {
  slot: "ministry_highlight" | "announcement_1" | "announcement_2" | "core_value_highlight";
  title: string;
  status: "updated" | "empty" | "missing_item";
};

export const pushSundaySlotsToPco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sundayIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }): Promise<{
    ok: boolean;
    error?: string;
    planId?: string;
    results?: PushSlotResult[];
  }> => {
    await assertCoreOrMeeting(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cfg } = await supabaseAdmin
      .from("pco_services_config")
      .select("sunday_service_type_id")
      .eq("id", true)
      .maybeSingle();
    const serviceTypeId = cfg?.sunday_service_type_id;
    if (!serviceTypeId) {
      return { ok: false, error: "Set the PCO Sunday Service Type ID in Settings first." };
    }

    // Read the 3 slots for this Sunday.
    const { data: slotRows } = await supabaseAdmin
      .from("event_sunday_slots")
      .select("channel, event_id, text_label")
      .eq("sunday_date", data.sundayIso);

    const slotMap: Record<string, { event_id: string | null; text_label: string | null }> = {};
    for (const r of (slotRows ?? []) as any[]) slotMap[r.channel] = r;

    // Resolve event titles for any event-backed slots.
    const eventIds = Array.from(
      new Set(Object.values(slotMap).map((r) => r.event_id).filter(Boolean) as string[]),
    );
    const eventTitles: Record<string, string> = {};
    if (eventIds.length > 0) {
      const { data: evs } = await supabaseAdmin
        .from("calendar_events")
        .select("id, title")
        .in("id", eventIds);
      for (const e of (evs ?? []) as any[]) eventTitles[e.id] = e.title;
    }

    function slotText(channel: string): string {
      const r = slotMap[channel];
      if (!r) return "";
      if (r.event_id) return eventTitles[r.event_id] ?? "";
      return (r.text_label ?? "").trim();
    }

    const pco = await import("@/server/pco-services.server");
    // Target the next upcoming plan on/after today (the staff meeting date).
    const todayIso = new Date().toISOString().slice(0, 10);
    const plan = await pco.findNextUpcomingPlan(serviceTypeId, todayIso);
    if (!plan) {
      return { ok: false, error: `No upcoming PCO plan found on or after ${todayIso}.` };
    }
    const items = await pco.listPlanItems(serviceTypeId, plan.id);
    const byTitle = new Map<string, { id: string }>();
    for (const it of items) {
      byTitle.set(it.title.trim().toLowerCase(), { id: it.id });
    }

    const channels: PushSlotResult["slot"][] = [
      "ministry_highlight",
      "announcement_1",
      "announcement_2",
      "core_value_highlight",
    ];
    const results: PushSlotResult[] = [];
    for (const ch of channels) {
      const text = slotText(ch);
      const expectedTitle = SLOT_TITLES[ch];
      if (!text) {
        results.push({ slot: ch, title: expectedTitle, status: "empty" });
        continue;
      }
      const match = byTitle.get(expectedTitle.toLowerCase());
      if (!match) {
        results.push({ slot: ch, title: expectedTitle, status: "missing_item" });
        continue;
      }
      try {
        await pco.updatePlanItemDescription(serviceTypeId, plan.id, match.id, text);
        results.push({ slot: ch, title: expectedTitle, status: "updated" });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? `Failed to update ${expectedTitle}` };
      }
    }

    return { ok: true, planId: plan.id, results };
  });
