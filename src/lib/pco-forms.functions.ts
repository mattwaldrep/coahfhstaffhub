import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import {
  listFormSubmissions,
  assertMeetingRole,
  resolveSince,
  FIRST_STEP_FORM_ID,
  NEXT_STEP_FORM_ID,
  type FormSubmission,
} from "./pco-forms.server";

export type FormSubmissionsResponse = {
  submissions: FormSubmission[];
  since: string;
  sinceLabel: string;
  formId: string;
  formUrl: string;
  error?: string;
};

export const listFirstStepSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<FormSubmissionsResponse> => {
    await assertMeetingRole(context.supabase, context.userId);
    const { since, sinceLabel } = await resolveSince(data.meetingId);
    const formId = FIRST_STEP_FORM_ID;
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

export const listNextStepSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<FormSubmissionsResponse> => {
    await assertMeetingRole(context.supabase, context.userId);
    const { since, sinceLabel } = await resolveSince(data.meetingId);
    const formId = NEXT_STEP_FORM_ID;
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
