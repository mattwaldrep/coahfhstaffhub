import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingComment = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string | null;
  author_email: string | null;
};

export const listOnboardingComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workflowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tasks } = await supabase
      .from("onboarding_tasks")
      .select("id")
      .eq("workflow_id", data.workflowId);
    const ids = (tasks ?? []).map((t: any) => t.id);
    if (ids.length === 0) return [] as OnboardingComment[];

    const { data: rows, error } = await supabase
      .from("onboarding_task_comments")
      .select("id, task_id, author_id, body, created_at")
      .in("task_id", ids)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const authorIds = Array.from(new Set((rows ?? []).map((r: any) => r.author_id)));
    const profilesById = new Map<string, { full_name: string | null; email: string | null }>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      (profs ?? []).forEach((p: any) =>
        profilesById.set(p.id, { full_name: p.full_name, email: p.email }),
      );
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      author_name: profilesById.get(r.author_id)?.full_name ?? null,
      author_email: profilesById.get(r.author_id)?.email ?? null,
    })) as OnboardingComment[];
  });

export const addOnboardingComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("onboarding_task_comments")
      .insert({ task_id: data.taskId, author_id: userId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOnboardingComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ commentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("onboarding_task_comments")
      .delete()
      .eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
