import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Pencil, Trash2, X, ArrowUp, ArrowDown, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/checklists")({
  component: ChecklistsPage,
});

type Template = { id: string; name: string; description: string | null };
type Item = { id: string; template_id: string; label: string; position: number };

function ChecklistsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftItems, setDraftItems] = useState<{ id?: string; label: string }[]>([]);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: t }, { data: i }] = await Promise.all([
      supabase.from("checklist_templates" as any).select("*").order("name"),
      supabase.from("checklist_template_items" as any).select("*").order("position"),
    ]);
    setTemplates((t ?? []) as unknown as Template[]);
    const map: Record<string, Item[]> = {};
    for (const row of ((i ?? []) as unknown as Item[])) {
      (map[row.template_id] ??= []).push(row);
    }
    setItems(map);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setName("");
    setDescription("");
    setDraftItems([]);
    setNewItemLabel("");
    setOpen(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setDraftItems((items[t.id] ?? []).map((it) => ({ id: it.id, label: it.label })));
    setNewItemLabel("");
    setOpen(true);
  }

  function addDraftItem() {
    const v = newItemLabel.trim();
    if (!v) return;
    setDraftItems((d) => [...d, { label: v }]);
    setNewItemLabel("");
  }

  function moveDraft(idx: number, dir: -1 | 1) {
    setDraftItems((d) => {
      const next = [...d];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return d;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function removeDraft(idx: number) {
    setDraftItems((d) => d.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      let templateId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("checklist_templates" as any)
          .update({ name: name.trim(), description: description.trim() || null })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("checklist_templates" as any)
          .insert({ name: name.trim(), description: description.trim() || null })
          .select("id")
          .single();
        if (error) throw error;
        templateId = (data as any).id;
      }

      // Replace items: delete existing, insert current draft.
      const { error: delErr } = await supabase
        .from("checklist_template_items" as any)
        .delete()
        .eq("template_id", templateId!);
      if (delErr) throw delErr;
      if (draftItems.length > 0) {
        const rows = draftItems.map((d, i) => ({
          template_id: templateId, label: d.label, position: i,
        }));
        const { error: insErr } = await supabase
          .from("checklist_template_items" as any)
          .insert(rows);
        if (insErr) throw insErr;
      }
      toast.success(editing ? "Template updated" : "Template created");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Delete "${t.name}"? It will be removed from any events it's attached to.`)) return;
    const { error } = await supabase.from("checklist_templates" as any).delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Template deleted");
    load();
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ListChecks className="w-6 h-6" /> Checklist Templates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Reusable task lists you can attach to events and recurring classes.
              Each occurrence tracks its own checkbox state.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-1.5" /> New template
            </Button>
          )}
        </div>

        {templates.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No templates yet"
            description={canEdit ? "Create your first reusable checklist." : "No templates have been created."}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map((t) => {
              const its = items[t.id] ?? [];
              return (
                <div key={t.id} className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(t)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {its.length} {its.length === 1 ? "item" : "items"}
                  </div>
                  {its.length > 0 && (
                    <ul className="text-sm space-y-0.5 pl-1">
                      {its.slice(0, 5).map((it) => (
                        <li key={it.id} className="text-muted-foreground">• {it.label}</li>
                      ))}
                      {its.length > 5 && (
                        <li className="text-xs text-muted-foreground italic">+ {its.length - 5} more</li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Attach a template to an event from the{" "}
          <Link to="/calendar" className="underline">Calendar</Link>.
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pot Luck setup" />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Items</Label>
              <div className="space-y-1">
                {draftItems.map((d, i) => (
                  <div key={i} className="flex items-center gap-1 group">
                    <span className="flex-1 text-sm border border-border rounded-md px-2 py-1.5">
                      {d.label}
                    </span>
                    <Button size="icon" variant="ghost" type="button" onClick={() => moveDraft(i, -1)} disabled={i === 0}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" type="button" onClick={() => moveDraft(i, 1)} disabled={i === draftItems.length - 1}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" type="button" onClick={() => removeDraft(i)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add an item…"
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addDraftItem(); }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addDraftItem}>Add</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
