import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Plus,
  Upload,
  FileText,
  Download,
  Trash2,
  Star,
  Search,
  History,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  listGoverningDocs,
  createGoverningDoc,
  updateGoverningDoc,
  deleteGoverningDoc,
  addDocVersion,
  markVersionOfficial,
  deleteDocVersion,
  getDocVersionUrl,
  type GoverningDoc,
} from "@/lib/documents.functions";

export const Route = createFileRoute("/documents/")({
  component: DocumentsPage,
});

const BUCKET = "governing-documents";

function DocumentsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const qc = useQueryClient();

  const listFn = useServerFn(listGoverningDocs);
  const createFn = useServerFn(createGoverningDoc);
  const updateFn = useServerFn(updateGoverningDoc);
  const deleteFn = useServerFn(deleteGoverningDoc);
  const addVersionFn = useServerFn(addDocVersion);
  const markOfficialFn = useServerFn(markVersionOfficial);
  const deleteVersionFn = useServerFn(deleteDocVersion);
  const getUrlFn = useServerFn(getDocVersionUrl);

  const { data: docs = [], isLoading } = useQuery<GoverningDoc[]>({
    queryKey: ["governing-docs"],
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["governing-docs"] });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<GoverningDoc | null>(null);
  const [uploadDoc, setUploadDoc] = useState<GoverningDoc | null>(null);

  const categories = useMemo(() => {
    const s = new Set<string>();
    docs.forEach((d) => s.add(d.category));
    return Array.from(s).sort();
  }, [docs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (categoryFilter && d.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.versions.some((v) => v.file_name.toLowerCase().includes(q))
      );
    });
  }, [docs, search, categoryFilter]);

  const grouped = useMemo(() => {
    const m = new Map<string, GoverningDoc[]>();
    filtered.forEach((d) => {
      const arr = m.get(d.category) ?? [];
      arr.push(d);
      m.set(d.category, arr);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openVersion(versionId: string) {
    try {
      const { url } = await getUrlFn({ data: { id: versionId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open document");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Official documents that govern the church and staff — handbook,
              policies, bylaws, etc. Each document has a single official version;
              older versions are kept for history.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> New document
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={categoryFilter === null ? "default" : "outline"}
              onClick={() => setCategoryFilter(null)}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={categoryFilter === c ? "default" : "outline"}
                onClick={() => setCategoryFilter(c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={docs.length === 0 ? "No documents yet" : "No matches"}
            description={
              docs.length === 0
                ? "Add the employee handbook, bylaws, and other governing documents so everyone knows what's official."
                : "Try a different search or clear the category filter."
            }
          />
        ) : (
          <div className="space-y-6">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  {cat}
                </div>
                <div className="space-y-2">
                  {list.map((d) => {
                    const isOpen = expanded.has(d.id);
                    const cv = d.current_version;
                    return (
                      <Card key={d.id}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start gap-3 flex-wrap">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(d.id)}
                              className="mt-1 text-muted-foreground hover:text-foreground"
                              title={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                <span className="truncate">{d.title}</span>
                                {cv ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Star className="w-3 h-3 fill-current" />
                                    {cv.version_label}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">No official version</Badge>
                                )}
                                {d.versions.length > 0 && (
                                  <span className="text-xs text-muted-foreground font-normal">
                                    · {d.versions.length} version
                                    {d.versions.length === 1 ? "" : "s"}
                                  </span>
                                )}
                              </CardTitle>
                              {d.description && (
                                <div className="text-sm text-muted-foreground mt-0.5">
                                  {d.description}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {cv && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openVersion(cv.id)}
                                >
                                  <Download className="w-3.5 h-3.5 mr-1" />
                                  Open official
                                </Button>
                              )}
                              {canEdit && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setUploadDoc(d)}
                                    title="Upload new version"
                                  >
                                    <Upload className="w-3.5 h-3.5 mr-1" />
                                    Upload version
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditDoc(d)}
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    title="Delete document"
                                    onClick={async () => {
                                      if (
                                        !confirm(
                                          `Delete "${d.title}" and all its versions?`,
                                        )
                                      )
                                        return;
                                      try {
                                        await deleteFn({ data: { id: d.id } });
                                        toast.success("Deleted");
                                        invalidate();
                                      } catch (e: any) {
                                        toast.error(e?.message ?? "Failed");
                                      }
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        {isOpen && (
                          <CardContent className="pt-0">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                              <History className="w-3 h-3" /> Version history
                            </div>
                            {d.versions.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic">
                                No versions uploaded yet.
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {d.versions.map((v) => {
                                  const isOfficial = v.id === d.current_version_id;
                                  return (
                                    <div
                                      key={v.id}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-sm"
                                    >
                                      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                                      <button
                                        type="button"
                                        className="flex-1 min-w-0 text-left truncate hover:underline"
                                        onClick={() => openVersion(v.id)}
                                        title={v.file_name}
                                      >
                                        <span className="font-medium">
                                          {v.version_label}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {" "}
                                          · {v.file_name}
                                        </span>
                                      </button>
                                      <span className="text-[11px] text-muted-foreground shrink-0">
                                        {new Date(v.created_at).toLocaleDateString()}
                                      </span>
                                      {isOfficial ? (
                                        <Badge variant="secondary" className="gap-1">
                                          <Star className="w-3 h-3 fill-current" />
                                          Official
                                        </Badge>
                                      ) : canEdit ? (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7"
                                          onClick={async () => {
                                            try {
                                              await markOfficialFn({
                                                data: {
                                                  document_id: d.id,
                                                  version_id: v.id,
                                                },
                                              });
                                              toast.success(
                                                "Marked as official version",
                                              );
                                              invalidate();
                                            } catch (e: any) {
                                              toast.error(e?.message ?? "Failed");
                                            }
                                          }}
                                        >
                                          <Star className="w-3.5 h-3.5 mr-1" />
                                          Mark official
                                        </Button>
                                      ) : null}
                                      {canEdit && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-destructive"
                                          title="Delete this version"
                                          onClick={async () => {
                                            if (
                                              !confirm(
                                                `Delete version "${v.version_label}"?`,
                                              )
                                            )
                                              return;
                                            try {
                                              await deleteVersionFn({
                                                data: { id: v.id },
                                              });
                                              toast.success("Version deleted");
                                              invalidate();
                                            } catch (e: any) {
                                              toast.error(e?.message ?? "Failed");
                                            }
                                          }}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DocumentDialog
          open={createOpen || !!editDoc}
          doc={editDoc}
          onClose={() => {
            setCreateOpen(false);
            setEditDoc(null);
          }}
          onSubmit={async (values) => {
            try {
              if (editDoc) {
                await updateFn({ data: { id: editDoc.id, ...values } });
                toast.success("Updated");
              } else {
                await createFn({ data: values });
                toast.success("Document created");
              }
              invalidate();
              setCreateOpen(false);
              setEditDoc(null);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            }
          }}
          existingCategories={categories}
        />

        <UploadVersionDialog
          doc={uploadDoc}
          onClose={() => setUploadDoc(null)}
          onUpload={async (values) => {
            if (!uploadDoc) return;
            try {
              const safeName = values.file.name.replace(/[^\w.\-]+/g, "_");
              const path = `${uploadDoc.id}/${Date.now()}-${safeName}`;
              const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(path, values.file, { upsert: false });
              if (upErr) throw upErr;
              await addVersionFn({
                data: {
                  document_id: uploadDoc.id,
                  version_label: values.version_label,
                  file_path: path,
                  file_name: values.file.name,
                  mime_type: values.file.type || null,
                  size_bytes: values.file.size,
                  notes: values.notes || null,
                  mark_official: values.mark_official,
                },
              });
              toast.success("Version uploaded");
              invalidate();
              setUploadDoc(null);
            } catch (e: any) {
              toast.error(e?.message ?? "Upload failed");
            }
          }}
        />
      </div>
    </AppShell>
  );
}

function DocumentDialog({
  open,
  doc,
  onClose,
  onSubmit,
  existingCategories,
}: {
  open: boolean;
  doc: GoverningDoc | null;
  onClose: () => void;
  onSubmit: (v: {
    title: string;
    description: string | null;
    category: string;
  }) => Promise<void>;
  existingCategories: string[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [saving, setSaving] = useState(false);

  // Reset when opening
  useMemo(() => {
    if (open) {
      setTitle(doc?.title ?? "");
      setDescription(doc?.description ?? "");
      setCategory(doc?.category ?? "General");
    }
  }, [open, doc]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{doc ? "Edit document" : "New document"}</DialogTitle>
          <DialogDescription>
            {doc
              ? "Update the document's metadata."
              : "Create a document entry. You can upload the file version afterward."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Employee Handbook"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. HR, Bylaws, Finance"
              list="doc-categories"
            />
            <datalist id="doc-categories">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !title.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({
                  title: title.trim(),
                  description: description.trim() || null,
                  category: category.trim() || "General",
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadVersionDialog({
  doc,
  onClose,
  onUpload,
}: {
  doc: GoverningDoc | null;
  onClose: () => void;
  onUpload: (v: {
    file: File;
    version_label: string;
    notes: string;
    mark_official: boolean;
  }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [markOfficial, setMarkOfficial] = useState(true);
  const [uploading, setUploading] = useState(false);

  useMemo(() => {
    if (doc) {
      setFile(null);
      const nextNum = (doc.versions.length ?? 0) + 1;
      setVersionLabel(`v${nextNum}`);
      setNotes("");
      setMarkOfficial(true);
    }
  }, [doc]);

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload new version</DialogTitle>
          <DialogDescription>
            {doc ? `Add a new version of "${doc.title}".` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>File</Label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label>Version label</Label>
            <Input
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="v2, 2025 Rev A, etc."
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What changed in this version?"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markOfficial}
              onChange={(e) => setMarkOfficial(e.target.checked)}
            />
            Mark this as the official version
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            disabled={uploading || !file || !versionLabel.trim()}
            onClick={async () => {
              if (!file) return;
              setUploading(true);
              try {
                await onUpload({
                  file,
                  version_label: versionLabel.trim(),
                  notes,
                  mark_official: markOfficial,
                });
              } finally {
                setUploading(false);
              }
            }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
