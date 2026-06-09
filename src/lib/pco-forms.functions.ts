import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { listFormSubmissions, type FormSubmission } from "@/server/pco-forms.server";

const FIRST_STEP_FORM_ID = "161115";
const NEXT_STEP_FORM_ID = "433638";

async function assertMeetingRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["core", "meeting"]);
  if (!data || data.length === 0) throw new Error("Forbidden: meeting role required");
}

export type FormSubmissionsResponse = {
  submissions: FormSubmission[];
  since: string; // ISO datetime cutoff
  sinceLabel: string; // human-friendly previous-meeting date (YYYY-MM-DD) or "7 days ago"
  formId: string;
  formUrl: string;
  error?: string;
};

async function resolveSince(meetingId: string): Promise<{ since: string; sinceLabel: string }> {
  const { data: cur } = await supabaseAdmin
    .from("meetings")
    .select("meeting_date")
    .eq("id", meetingId)
    .maybeSingle();
  const currentDate = cur?.meeting_date ?? new Date().toISOString().slice(0, 10);
  const { data: prev } = await supabaseAdmin
    .from("meetings")
    .select("meeting_date")
    .lt("meeting_date", currentDate)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prev?.meeting_date) {
    // Start-of-day for the previous meeting date (UTC)
    const iso = new Date(`${prev.meeting_date}T00:00:00Z`).toISOString();
    return { since: iso, sinceLabel: prev.meeting_date };
  }
  const d = new Date(`${currentDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return { since: d.toISOString(), sinceLabel: d.toISOString().slice(0, 10) };
}

function buildFetcher(formId: string) {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
    .handler(async ({ data, context }): Promise<FormSubmissionsResponse> => {
      await assertMeetingRole(context.supabase, context.userId);
      const { since, sinceLabel } = await resolveSince(data.meetingId);
      const formUrl = `https://people.planningcenteronline.com/forms/${formId}`;
      try {
        const submissions = await listFormSubmissions(formId, since);
        return { submissions, since, sinceLabel, formId, formUrl };
      } catch (e: any) {
        return {
          submissions: [],
          since,
          sinceLabel,
          formId,
          formUrl,
          error: e?.message ?? "Failed to load submissions from Planning Center.",
        };
      }
    });
}

export const listFirstStepSubmissions = buildFetcher(FIRST_STEP_FORM_ID);
export const listNextStepSubmissions = buildFetcher(NEXT_STEP_FORM_ID);
