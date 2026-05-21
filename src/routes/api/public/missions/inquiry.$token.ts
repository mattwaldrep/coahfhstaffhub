import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InquirySchema = z.object({
  church_name: z.string().trim().min(1).max(200),
  leader_name: z.string().trim().min(1).max(200),
  leader_phone: z.string().trim().min(1).max(50),
  leader_email: z.string().trim().email().max(255),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  alternate_dates: z.string().trim().max(1000).optional().default(""),
  vision: z.string().trim().min(1).max(4000),
  church_context: z.string().trim().min(1).max(4000),
});

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/missions/inquiry/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!TOKEN_RE.test(params.token)) {
          return new Response(JSON.stringify({ error: "Invalid link" }), { status: 400 });
        }
        const { data } = await supabaseAdmin
          .from("mission_trips")
          .select("church_name, inquiry_submitted_at")
          .eq("inquiry_token", params.token)
          .maybeSingle();
        if (!data) {
          return new Response(JSON.stringify({ error: "Link not found" }), { status: 404 });
        }
        return Response.json({
          church_name: data.church_name,
          already_submitted: !!data.inquiry_submitted_at,
        });
      },
      POST: async ({ request, params }) => {
        if (!TOKEN_RE.test(params.token)) {
          return new Response(JSON.stringify({ error: "Invalid link" }), { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        }
        const parsed = InquirySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Validation failed", issues: parsed.error.issues }),
            { status: 400 },
          );
        }
        const d = parsed.data;
        const { data: trip } = await supabaseAdmin
          .from("mission_trips")
          .select("id")
          .eq("inquiry_token", params.token)
          .maybeSingle();
        if (!trip) {
          return new Response(JSON.stringify({ error: "Link not found" }), { status: 404 });
        }

        const { data: existing } = await supabaseAdmin
          .from("mission_trips")
          .select("steps")
          .eq("id", trip.id)
          .single();
        const steps = {
          ...((existing?.steps as Record<string, boolean> | null) ?? {}),
          questionnaire_received: true,
        };

        const { error } = await supabaseAdmin
          .from("mission_trips")
          .update({
            church_name: d.church_name,
            leader_name: d.leader_name,
            leader_phone: d.leader_phone,
            leader_email: d.leader_email,
            start_date: d.start_date || null,
            end_date: d.end_date || null,
            alternate_dates: d.alternate_dates || null,
            vision: d.vision,
            church_context: d.church_context,
            inquiry_submitted_at: new Date().toISOString(),
            steps,
          })
          .eq("id", trip.id);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
