import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import {
  supabaseAdmin,
  assertElderAccess,
  assertFullElder,
} from "@/server/elder.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

type Choice = "yes" | "no" | "abstain";
type Outcome = "open" | "passed" | "failed" | "tied";

function computeOutcome(yes: number, no: number): Exclude<Outcome, "open"> {
  if (yes > no) return "passed";
  if (no > yes) return "failed";
  return "tied";
}

async function getElderEmails(): Promise<string[]> {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "elder");
  const ids = (roles ?? []).map((r: any) => r.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .in("id", ids);
  return (profiles ?? []).map((p: any) => p.email).filter(Boolean);
}

function motionUrl(id: string) {
  const base =
    process.env.PUBLIC_APP_URL ||
    "https://coahfhstaffhub.lovable.app";
  return `${base}/elder/motions/${id}`;
}

async function tallyVotes(motionId: string) {
  const { data } = await supabaseAdmin
    .from("elder_motion_votes")
    .select("choice")
    .eq("motion_id", motionId);
  const tally = { yes: 0, no: 0, abstain: 0 };
  for (const v of (data ?? []) as Array<{ choice: Choice }>) {
    tally[v.choice]++;
  }
  return tally;
}

async function autoCloseExpired() {
  const { data: expired } = await supabaseAdmin
    .from("elder_motions")
    .select("id, title, deadline_at")
    .is("closed_at", null)
    .lt("deadline_at", new Date().toISOString());
  for (const m of (expired ?? []) as Array<{ id: string; title: string }>) {
    await finalizeMotion(m.id, null);
  }
}

async function finalizeMotion(motionId: string, closedBy: string | null) {
  const tally = await tallyVotes(motionId);
  const outcome = computeOutcome(tally.yes, tally.no);
  const { data: motion } = await supabaseAdmin
    .from("elder_motions")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
      outcome,
      tally_yes: tally.yes,
      tally_no: tally.no,
      tally_abstain: tally.abstain,
    })
    .eq("id", motionId)
    .is("closed_at", null)
    .select("id, title")
    .maybeSingle();
  if (!motion) return;
  // Notify
  try {
    const emails = await getElderEmails();
    if (emails.length) {
      await sendEmail({
        to: emails,
        subject: `Motion ${outcome.toUpperCase()}: ${motion.title}`,
        html: emailLayout(
          `Motion ${outcome}`,
          `<p><strong>${escapeHtml(motion.title)}</strong> has closed.</p>
           <p>Result: <strong>${outcome.toUpperCase()}</strong><br/>
           Yes: ${tally.yes} &middot; No: ${tally.no} &middot; Abstain: ${tally.abstain}</p>
           <p><a href="${motionUrl(motion.id)}">View motion</a></p>`,
        ),
      });
      await supabaseAdmin
        .from("elder_motions")
        .update({ close_notified_at: new Date().toISOString() })
        .eq("id", motion.id);
    }
  } catch (e) {
    console.error("close email failed", e);
  }
}

// ---------- Server functions ----------

export const listMotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertElderAccess(context.supabase, context.userId);
    await autoCloseExpired();
    const { data, error } = await supabaseAdmin
      .from("elder_motions")
      .select(
        "id, title, description, created_by, created_at, deadline_at, closed_at, outcome, tally_yes, tally_no, tally_abstain",
      )
      .order("closed_at", { ascending: true, nullsFirst: true })
      .order("deadline_at", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((m: any) => m.id);
    let myVotes: Record<string, Choice> = {};
    let liveTallies: Record<string, { yes: number; no: number; abstain: number }> = {};
    if (ids.length) {
      const { data: votes } = await supabaseAdmin
        .from("elder_motion_votes")
        .select("motion_id, voter_id, choice")
        .in("motion_id", ids);
      for (const v of (votes ?? []) as Array<{ motion_id: string; voter_id: string; choice: Choice }>) {
        if (v.voter_id === context.userId) myVotes[v.motion_id] = v.choice;
        const t = (liveTallies[v.motion_id] ??= { yes: 0, no: 0, abstain: 0 });
        t[v.choice]++;
      }
    }

    // Creator names
    const creatorIds = Array.from(new Set((data ?? []).map((m: any) => m.created_by)));
    let creators: Record<string, string> = {};
    if (creatorIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", creatorIds);
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
        creators[p.id] = p.full_name ?? "";
      }
    }

    return (data ?? []).map((m: any) => ({
      ...m,
      created_by_name: creators[m.created_by] ?? "",
      my_vote: myVotes[m.id] ?? null,
      live_tally: liveTallies[m.id] ?? { yes: 0, no: 0, abstain: 0 },
    }));
  });

export const getMotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertElderAccess(context.supabase, context.userId);
    const { data: motion, error } = await supabaseAdmin
      .from("elder_motions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!motion) throw new Error("Motion not found");

    const { data: votes } = await supabaseAdmin
      .from("elder_motion_votes")
      .select("voter_id, choice, comment, voted_at, updated_at")
      .eq("motion_id", data.id)
      .order("voted_at", { ascending: true });

    const ids = Array.from(
      new Set([motion.created_by, ...((votes ?? []) as any[]).map((v) => v.voter_id)]),
    );
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    const profMap: Record<string, { name: string; email: string | null }> = {};
    for (const p of (profs ?? []) as any[]) {
      profMap[p.id] = { name: p.full_name ?? "", email: p.email };
    }

    return {
      motion,
      votes: ((votes ?? []) as any[]).map((v) => ({
        ...v,
        voter_name: profMap[v.voter_id]?.name ?? "",
      })),
      created_by_name: profMap[motion.created_by]?.name ?? "",
    };
  });

export const createMotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(10_000).optional().default(""),
        deadline_at: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);
    const deadline = new Date(data.deadline_at);
    if (isNaN(deadline.getTime()) || deadline.getTime() < Date.now() + 60_000) {
      throw new Error("Deadline must be at least 1 minute in the future");
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("elder_motions")
      .insert({
        title: data.title,
        description: data.description || null,
        deadline_at: deadline.toISOString(),
        created_by: context.userId,
      })
      .select("id, title")
      .single();
    if (error) throw new Error(error.message);

    // Notify all full elders
    try {
      const emails = await getElderEmails();
      if (emails.length) {
        await sendEmail({
          to: emails,
          subject: `New motion to vote: ${inserted.title}`,
          html: emailLayout(
            "New motion",
            `<p>A new motion has been opened for elder vote.</p>
             <p><strong>${escapeHtml(inserted.title)}</strong></p>
             ${data.description ? `<p>${escapeHtml(data.description).replace(/\n/g, "<br/>")}</p>` : ""}
             <p>Deadline: <strong>${escapeHtml(deadline.toLocaleString())}</strong></p>
             <p><a href="${motionUrl(inserted.id)}">Cast your vote</a></p>`,
          ),
        });
        await supabaseAdmin
          .from("elder_motions")
          .update({ open_notified_at: new Date().toISOString() })
          .eq("id", inserted.id);
      }
    } catch (e) {
      console.error("open email failed", e);
    }
    return { id: inserted.id };
  });

export const castVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        motion_id: z.string().uuid(),
        choice: z.enum(["yes", "no", "abstain"]),
        comment: z.string().max(2000).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);
    // Verify motion still open
    const { data: motion } = await supabaseAdmin
      .from("elder_motions")
      .select("id, closed_at")
      .eq("id", data.motion_id)
      .maybeSingle();
    if (!motion) throw new Error("Motion not found");
    if (motion.closed_at) throw new Error("Motion is closed");

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("elder_motion_votes")
      .upsert(
        {
          motion_id: data.motion_id,
          voter_id: context.userId,
          choice: data.choice,
          comment: data.comment || null,
          voted_at: now,
          updated_at: now,
        },
        { onConflict: "motion_id,voter_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeMotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);
    await finalizeMotion(data.id, context.userId);
    return { ok: true };
  });
