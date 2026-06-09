import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const dateSchema = z.object({ serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export type SundayOpsFeedback = {
  id: string;
  submitted_by: string | null;
  submission_date: string | null;
  created_at: string;
  resource_title: string | null;
  resource_category: string | null;
  checked_items: any;
};

export type SundayOpsIssue = {
  id: string;
  created_at: string;
  occurred_on: string | null;
  resource_category: string | null;
  description: string | null;
  severity: string | null;
  reporter_name: string | null;
  image_url: string | null;
};

async function callOps(rawUrl: string, serviceDate: string) {
  const secret = process.env.STAFF_HUB_SHARED_SECRET;
  if (!secret) throw new Error("STAFF_HUB_SHARED_SECRET not configured");
  // Strip any pre-existing `date` param (the secret may include a `?date=YYYY-MM-DD` placeholder)
  const u = new URL(rawUrl);
  u.searchParams.delete("date");
  u.searchParams.set("date", serviceDate);
  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { "x-shared-secret": secret },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Sunday Ops ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export const getSundayOpsForDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => dateSchema.parse(d))
  .handler(async ({ data }) => {
    const feedbackUrl = process.env.SUNDAY_OPS_FEEDBACK_URL;
    const issuesUrl = process.env.SUNDAY_OPS_ISSUES_URL;
    if (!feedbackUrl || !issuesUrl) {
      return { submissions: [], issues: [], error: "Sunday Ops endpoints not configured" };
    }
    try {
      const [fb, iss] = await Promise.all([
        callOps(feedbackUrl, data.serviceDate),
        callOps(issuesUrl, data.serviceDate),
      ]);

      // Look up which issues have already been turned into tasks
      const issueList = (iss?.issues ?? []) as SundayOpsIssue[];
      const ids = issueList.map((i) => `sunday-ops-issue:${i.id}`);
      let importedSet = new Set<string>();
      if (ids.length) {
        const { data: existing } = await supabaseAdmin
          .from("action_items")
          .select("source_issue_external_id")
          .in("source_issue_external_id", ids);
        importedSet = new Set((existing ?? []).map((r: any) => r.source_issue_external_id));
      }

      return {
        submissions: (fb?.submissions ?? []) as SundayOpsFeedback[],
        issues: issueList.map((i) => ({
          ...i,
          alreadyImported: importedSet.has(`sunday-ops-issue:${i.id}`),
        })),
        error: null as string | null,
      };
    } catch (e: any) {
      return { submissions: [], issues: [], error: e.message ?? "Failed to load Sunday Ops data" };
    }
  });

export const importIssueAsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        issueId: z.string().min(1).max(200),
        title: z.string().min(1).max(500),
        notes: z.string().max(4000).optional(),
        occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const externalId = `sunday-ops-issue:${data.issueId}`;

    // Skip if already imported
    const { data: existing } = await supabaseAdmin
      .from("action_items")
      .select("id, google_task_id")
      .eq("source_issue_external_id", externalId)
      .maybeSingle();
    if (existing) return { ok: true, alreadyImported: true, actionItemId: existing.id };

    const { data: inserted, error } = await supabaseAdmin
      .from("action_items")
      .insert({
        title: data.title,
        notes: data.notes ?? null,
        assignee_id: context.userId,
        created_by: context.userId,
        source_issue_external_id: externalId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to create task");

    // Try to push to Google Tasks (best-effort)
    let pushed = false;
    let pushError: string | null = null;
    try {
      const { data: integ } = await supabaseAdmin
        .from("user_integrations")
        .select("*")
        .eq("user_id", context.userId)
        .eq("provider", "google_tasks")
        .maybeSingle();
      if (integ) {
        const accessToken = await ensureAccessToken(context.userId);
        const body: Record<string, any> = { title: data.title };
        if (data.notes) body.notes = data.notes;
        const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(result));
        await supabaseAdmin
          .from("action_items")
          .update({
            google_task_id: result.id,
            google_task_pushed_at: new Date().toISOString(),
            google_task_pushed_by: context.userId,
          })
          .eq("id", inserted.id);
        pushed = true;
      } else {
        pushError = "Google Tasks not connected";
      }
    } catch (e: any) {
      pushError = e.message ?? "Google Tasks push failed";
    }

    return { ok: true, alreadyImported: false, actionItemId: inserted.id, pushed, pushError };
  });

async function refreshAccessToken(refreshToken: string) {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google OAuth client not configured");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${JSON.stringify(json)}`);
  return json as { access_token: string; expires_in: number };
}

async function ensureAccessToken(userId: string): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google_tasks")
    .maybeSingle();
  if (!row) throw new Error("User has not connected Google Tasks");
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + 60_000) return row.access_token;
  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("user_integrations")
    .update({ access_token: refreshed.access_token, expires_at: newExpires })
    .eq("user_id", userId)
    .eq("provider", "google_tasks");
  return refreshed.access_token;
}
