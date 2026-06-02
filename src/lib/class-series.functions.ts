import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RRule, type Frequency } from "rrule";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
type WD = (typeof WD)[number];

const wdNum: Record<WD, number> = {
  SU: RRule.SU.weekday, MO: RRule.MO.weekday, TU: RRule.TU.weekday,
  WE: RRule.WE.weekday, TH: RRule.TH.weekday, FR: RRule.FR.weekday, SA: RRule.SA.weekday,
};

const seriesSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  active: z.boolean().default(true),
  start_date: z.string().min(1), // YYYY-MM-DD
  end_date: z.string().nullable().optional(),
  start_time: z.string().nullable().optional(), // HH:mm
  end_time: z.string().nullable().optional(),
  freq: z.enum(["WEEKLY", "MONTHLY"]).default("WEEKLY"),
  interval: z.number().int().min(1).max(52).default(1),
  byweekday: z.array(z.enum(WD)).max(7).default([]),
  bysetpos: z.number().int().min(-1).max(5).nullable().optional(),
  excluded_dates: z.array(z.string()).max(200).default([]),
  default_teacher_name: z.string().max(255).nullable().optional(),
  default_leader_name: z.string().max(255).nullable().optional(),
  default_childcare_needed: z.boolean().default(false),
  default_room_id: z.string().uuid().nullable().optional(),
});

type SeriesInput = z.infer<typeof seriesSchema>;

function combineDateTime(date: string, time: string | null | undefined): Date {
  // Local time interpretation
  const [y, m, d] = date.split("-").map(Number);
  if (time) {
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
  }
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0);
}

function buildRRule(s: SeriesInput): string | null {
  if (!s.byweekday.length && s.freq === "WEEKLY") return null;
  const opts: ConstructorParameters<typeof RRule>[0] = {
    freq: (s.freq === "MONTHLY" ? RRule.MONTHLY : RRule.WEEKLY) as Frequency,
    interval: s.interval || 1,
    dtstart: combineDateTime(s.start_date, s.start_time ?? null),
  };
  if (s.byweekday.length) opts.byweekday = s.byweekday.map((w) => wdNum[w]);
  if (s.freq === "MONTHLY" && s.bysetpos) opts.bysetpos = [s.bysetpos];
  if (s.end_date) {
    const [y, m, d] = s.end_date.split("-").map(Number);
    opts.until = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
  }
  return new RRule(opts).toString();
}

async function syncCalendarEvent(
  supabase: any,
  series: any,
  userId: string,
) {
  // If archived → remove linked event so the calendar stops showing it.
  if (!series.active) {
    if (series.calendar_event_id) {
      await supabase.from("event_rooms").delete().eq("event_id", series.calendar_event_id);
      await supabase.from("calendar_events").delete().eq("id", series.calendar_event_id);
      await supabase.from("class_series").update({ calendar_event_id: null }).eq("id", series.id);
    }
    return;
  }

  const rrule = buildRRule(series as SeriesInput);
  const start = combineDateTime(series.start_date, series.start_time);
  const end = series.end_time
    ? combineDateTime(series.start_date, series.end_time)
    : null;

  const payload = {
    title: series.name,
    sub_calendar: "general" as const,
    category: "Class",
    class_series_id: series.id,
    start_at: start.toISOString(),
    end_at: end ? end.toISOString() : null,
    all_day: false,
    leader_name: series.default_teacher_name || series.default_leader_name || null,
    childcare_needed: !!series.default_childcare_needed,
    childcare_arranged: false,
    rrule,
    recurrence_end_date: series.end_date || null,
    excluded_dates: series.excluded_dates ?? [],
    created_by: userId,
  };

  let eventId = series.calendar_event_id as string | null;

  if (eventId) {
    const { error } = await supabase.from("calendar_events").update(payload).eq("id", eventId);
    if (error) throw new Error(error.message);
  } else {
    const { data: inserted, error } = await supabase
      .from("calendar_events")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    eventId = inserted.id as string;
    await supabase.from("class_series").update({ calendar_event_id: eventId }).eq("id", series.id);
  }

  // Sync room assignment via event_rooms (single room from series default).
  await supabase.from("event_rooms").delete().eq("event_id", eventId);
  if (series.default_room_id) {
    await supabase.from("event_rooms").insert({
      event_id: eventId,
      room_id: series.default_room_id,
    });
  }
}

export const upsertClassSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => seriesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Derive the legacy `weekday` column from the first selected weekday so
    // dropdowns / older views still render sensibly.
    const weekday =
      data.byweekday.length > 0
        ? WD.indexOf(data.byweekday[0] as WD)
        : new Date(data.start_date).getDay();

    const row = {
      name: data.name,
      active: data.active,
      weekday,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      start_date: data.start_date,
      end_date: data.end_date || null,
      freq: data.freq,
      interval: data.interval,
      byweekday: data.byweekday,
      bysetpos: data.bysetpos ?? null,
      excluded_dates: data.excluded_dates ?? [],
      default_teacher_name: data.default_teacher_name || null,
      default_leader_name: data.default_leader_name || null,
      default_childcare_needed: data.default_childcare_needed,
      default_room_id: data.default_room_id || null,
      created_by: userId,
    };

    let series: any;
    if (data.id) {
      const { data: updated, error } = await supabase
        .from("class_series")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      series = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("class_series")
        .insert(row)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      series = inserted;
    }

    await syncCalendarEvent(supabase, series, userId);
    return { id: series.id as string };
  });

export const setClassSeriesActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("class_series")
      .update({ active: data.active })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await syncCalendarEvent(supabase, updated, userId);
    return { ok: true as const };
  });

export const deleteClassSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("class_series")
      .select("calendar_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (existing?.calendar_event_id) {
      await supabase.from("event_rooms").delete().eq("event_id", existing.calendar_event_id);
      await supabase.from("calendar_events").delete().eq("id", existing.calendar_event_id);
    }
    const { error } = await supabase.from("class_series").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
