import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "governing-documents";

async function assertCore(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: core role required");
}

export type GoverningDocVersion = {
  id: string;
  document_id: string;
  version_label: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type GoverningDoc = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  versions: GoverningDocVersion[];
  current_version: GoverningDocVersion | null;
};

export const listGoverningDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: docs, error } = await supabaseAdmin
      .from("governing_documents")
      .select("*")
      .order("category", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: versions } = await supabaseAdmin
      .from("governing_document_versions")
      .select("*")
      .order("created_at", { ascending: false });
    const byDoc = new Map<string, GoverningDocVersion[]>();
    (versions ?? []).forEach((v: any) => {
      const arr = byDoc.get(v.document_id) ?? [];
      arr.push(v);
      byDoc.set(v.document_id, arr);
    });
    return (docs ?? []).map((d: any) => {
      const vs = byDoc.get(d.id) ?? [];
      return {
        ...d,
        versions: vs,
        current_version: vs.find((v) => v.id === d.current_version_id) ?? null,
      } as GoverningDoc;
    });
  });

export const createGoverningDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(1).max(500),
        description: z.string().max(2000).nullable().optional(),
        category: z.string().min(1).max(120).default("General"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: ins, error } = await supabaseAdmin
      .from("governing_documents")
      .insert({
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const updateGoverningDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(2000).nullable().optional(),
        category: z.string().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("governing_documents")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGoverningDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: vs } = await supabaseAdmin
      .from("governing_document_versions")
      .select("file_path")
      .eq("document_id", data.id);
    const paths = (vs ?? []).map((v: any) => v.file_path);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }
    const { error } = await supabaseAdmin
      .from("governing_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addDocVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        document_id: z.string().uuid(),
        version_label: z.string().min(1).max(120),
        file_path: z.string().min(1),
        file_name: z.string().min(1).max(500),
        mime_type: z.string().max(200).nullable().optional(),
        size_bytes: z.number().int().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        mark_official: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: ins, error } = await supabaseAdmin
      .from("governing_document_versions")
      .insert({
        document_id: data.document_id,
        version_label: data.version_label,
        file_path: data.file_path,
        file_name: data.file_name,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        notes: data.notes ?? null,
        uploaded_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (data.mark_official) {
      await supabaseAdmin
        .from("governing_documents")
        .update({ current_version_id: ins.id })
        .eq("id", data.document_id);
    }
    return ins;
  });

export const markVersionOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        document_id: z.string().uuid(),
        version_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("governing_documents")
      .update({ current_version_id: data.version_id })
      .eq("id", data.document_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDocVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin
      .from("governing_document_versions")
      .select("id, file_path, document_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    // If this was the official version, clear it out on the doc first.
    await supabaseAdmin
      .from("governing_documents")
      .update({ current_version_id: null })
      .eq("id", row.document_id)
      .eq("current_version_id", row.id);
    await supabaseAdmin.storage.from(BUCKET).remove([row.file_path]);
    await supabaseAdmin
      .from("governing_document_versions")
      .delete()
      .eq("id", row.id);
    return { ok: true };
  });

export const getDocVersionUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("governing_document_versions")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Version not found");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
