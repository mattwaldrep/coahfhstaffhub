import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMeetingRecapInternal } from "@/server/meeting-recap.server";

async function assertMeetingRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["core", "meeting"]);
  if (!data || data.length === 0) throw new Error("Forbidden: meeting role required");
}

export const finalizeMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMeetingRole(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("meetings")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.meetingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMeetingRecap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMeetingRole(context.supabase, context.userId);
    const { recipients } = await sendMeetingRecapInternal(data.meetingId);
    return { ok: true, recipients };
  });

