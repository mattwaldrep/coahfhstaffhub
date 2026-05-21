import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_docs/v1";

const InputSchema = z.object({
  tripId: z.string().uuid(),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(100_000),
  existingDocId: z.string().min(1).max(200).nullable().optional(),
});

async function docsFetch(path: string, init: RequestInit) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const GOOGLE_DOCS_API_KEY = process.env.GOOGLE_DOCS_API_KEY;
  if (!GOOGLE_DOCS_API_KEY) throw new Error("Google Docs connector is not configured");

  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DOCS_API_KEY,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Docs API [${res.status}]: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export const syncItineraryDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    let docId = data.existingDocId ?? null;

    // Create if missing
    if (!docId) {
      const created = await docsFetch(`/documents`, {
        method: "POST",
        body: JSON.stringify({ title: data.title }),
      });
      docId = created.documentId as string;
    } else {
      // Update title (best-effort) and clear content
      const doc = await docsFetch(`/documents/${docId}`, { method: "GET" });
      const body = doc.body?.content ?? [];
      const last = body[body.length - 1];
      const endIndex = (last?.endIndex ?? 2) as number;
      const requests: any[] = [];
      if (endIndex > 2) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: 1, endIndex: endIndex - 1 },
          },
        });
      }
      if (doc.title !== data.title) {
        // Docs API has no direct title update via batchUpdate; use documents:update via PATCH not supported here.
        // Title stays as originally created. (Acceptable — recipients see content.)
      }
      if (requests.length) {
        await docsFetch(`/documents/${docId}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify({ requests }),
        });
      }
    }

    // Insert the content as plain text at index 1
    await docsFetch(`/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: data.content,
            },
          },
        ],
      }),
    });

    const url = `https://docs.google.com/document/d/${docId}/edit`;
    return { docId: docId!, url };
  });
