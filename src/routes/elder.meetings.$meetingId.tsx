import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  getElderMeeting, upsertAgendaItem, deleteAgendaItem, setAgendaExecutive, setAgendaCarryToNext,
  saveSectionNotes, createElderAction, updateElderAction, deleteElderAction,
  upsertJointItem, deleteJointItem, updateElderMeeting,
  listMentionableUsers, createActionsFromMentions,
} from "@/lib/elder.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, RichTextView, extractMentions } from "@/components/ui/rich-text-editor";
import { LinkedText } from "@/lib/render-linked-text";
import type { MentionUser } from "@/components/ui/mention-list";
import { Plus, Trash2, Lock, Unlock, ChevronLeft, ChevronDown, ChevronRight, Check, Square, Bookmark, GripVertical, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { PastoralCareList } from "@/components/pastoral/PastoralCareList";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/elder/meetings/$meetingId")({
  component: MeetingDetail,
});

const STANDARD_SECTIONS = [
  { key: "opening", label: "Opening / Prayer" },
  { key: "follow_up", label: "Last Meeting Follow-up" },
  { key: "pastoral", label: "Pastoral Care", isPastoral: true },
  { key: "new_business", label: "New Business" },
  { key: "executive", label: "Executive Session", execHint: true },
  { key: "closing", label: "Closing / Prayer" },
];

const JOINT_SUBSECTIONS = [
  { key: "need_to_know", label: "What we need to know" },
  { key: "resource", label: "How can we serve / resource" },
  { key: "upcoming", label: "Upcoming events" },
];

function MeetingDetail() {
  const { meetingId } = Route.useParams();
  const { isFullElder, hasElderAccess, isDeaconOnly, isChairOfDeacons } = useAuth();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);

  useEffect(() => {
    listMentionableUsers().then((u: any) => setMentionUsers(u as MentionUser[])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await getElderMeeting({ data: { id: meetingId } });
      setData(result);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`elder-meeting-${meetingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "elder_agenda_items", filter: `meeting_id=eq.${meetingId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "elder_action_items", filter: `meeting_id=eq.${meetingId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "elder_section_notes", filter: `meeting_id=eq.${meetingId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "elder_joint_deacon_items", filter: `meeting_id=eq.${meetingId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, load]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Meeting not found.</div>;

  const m = data.meeting;
  const isJoint = m.meeting_type === "joint";
  const canEditJoint = hasElderAccess || isChairOfDeacons;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/elder/meetings" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <h2 className="text-xl font-display font-semibold">{m.title}</h2>
            <div className="text-xs text-muted-foreground">
              {format(new Date(m.meeting_date), "EEEE, MMM d, yyyy")} · {isJoint ? "Joint" : "Standard"}
            </div>
          </div>
        </div>
        {!isDeaconOnly && (
          <div className="flex items-center gap-2">
            <select
              className="bg-background border border-border rounded h-8 px-2 text-xs"
              value={m.status}
              onChange={async (e) => {
                await updateElderMeeting({ data: { id: m.id, status: e.target.value as any } });
                load();
              }}
            >
              <option value="draft">Draft</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
      </div>

      {!isDeaconOnly && (
        <StandardSections meetingId={meetingId} agenda={data.agenda} sectionNotes={data.sectionNotes} isFullElder={isFullElder} reload={load} mentionUsers={mentionUsers} />
      )}

      {isJoint && (
        <JointSections meetingId={meetingId} items={data.jointItems} reload={load} mentionUsers={mentionUsers} canEdit={canEditJoint} />
      )}

      {!isDeaconOnly && (
        <ActionItemsBlock meetingId={meetingId} items={data.actionItems} isFullElder={isFullElder} reload={load} />
      )}
    </div>
  );
}

function StandardSections({ meetingId, agenda, sectionNotes, isFullElder, reload, mentionUsers }: any) {
  return (
    <div className="space-y-4">
      {STANDARD_SECTIONS.map((s) => {
        if (s.key === "executive" && !isFullElder) return null;
        if ((s as any).isPastoral) {
          return (
            <CollapsibleCard
              key={s.key}
              storageKey={`elder-collapsed:${meetingId}:${s.key}`}
              header={
                <div className="flex items-center justify-between w-full">
                  <span>Pastoral Care</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Synced from Planning Center
                  </span>
                </div>
              }
            >
              <div className="p-4">
                <PastoralCareList meetingId={meetingId} variant="meeting" />
              </div>
            </CollapsibleCard>
          );
        }
        const items = agenda.filter((a: any) => a.section_key === s.key);
        const note = sectionNotes.find((n: any) => n.section_key === s.key);
        return (
          <SectionCard
            key={s.key}
            section={s}
            meetingId={meetingId}
            items={items}
            note={note}
            isFullElder={isFullElder}
            reload={reload}
            mentionUsers={mentionUsers}
          />
        );
      })}
    </div>
  );
}

function SectionCard({ section, meetingId, items, note, isFullElder, reload, mentionUsers }: any) {
  const [adding, setAdding] = useState("");
  const [notes, setNotes] = useState(note?.notes ?? "");
  const isExec = section.key === "executive";

  useEffect(() => { setNotes(note?.notes ?? ""); }, [note?.notes]);

  async function add() {
    const plain = adding.replace(/<[^>]+>/g, "").trim();
    if (!plain) return;
    try {
      await upsertAgendaItem({
        data: {
          meeting_id: meetingId,
          section_key: section.key,
          title: adding,
          executive_session: isExec,
        },
      });
      setAdding("");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <CollapsibleCard
      storageKey={`elder-collapsed:${meetingId}:${section.key}`}
      className={isExec ? "border-[oklch(0.55_0.15_280)]/40 ring-1 ring-[oklch(0.55_0.15_280)]/20" : ""}
      header={
        <div className="flex items-center gap-2">
          {isExec && <Lock className="w-3.5 h-3.5 text-[oklch(0.55_0.15_280)]" />}
          <span>{section.label}</span>
          {isExec && <span className="text-[10px] uppercase tracking-wider text-[oklch(0.55_0.15_280)]">Full Elders Only</span>}
          <span className="text-[10px] text-muted-foreground ml-1">({items.length})</span>
        </div>
      }
    >
      <div className="p-4 space-y-3">
        <SortableAgendaList
          items={items}
          onReorder={async (reordered: any[]) => {
            try {
              await Promise.all(
                reordered.map((it: any, idx: number) =>
                  it.position === idx
                    ? null
                    : upsertAgendaItem({
                        data: {
                          id: it.id,
                          meeting_id: meetingId,
                          section_key: it.section_key,
                          title: it.title,
                          position: idx,
                        },
                      }),
                ),
              );
              reload();
            } catch (e: any) {
              toast.error(e.message ?? "Failed to reorder");
            }
          }}
          renderItem={(item: any) => (
            <AgendaItemRow item={item} isFullElder={isFullElder} reload={reload} meetingId={meetingId} />
          )}
        />
        <div className="space-y-2">
          <RichTextEditor
            value={adding}
            onChange={setAdding}
            placeholder="Add agenda item…  (use the link button to add hyperlinks)"
            minHeight={40}
          />
          <Button size="sm" variant="outline" onClick={add}><Plus className="w-3 h-3 mr-1" /> Add</Button>
        </div>
        <RichTextEditor
          value={notes}
          onChange={setNotes}
          placeholder="Section notes… (type @ to assign a task)"
          minHeight={96}
          mentionUsers={mentionUsers}
          onBlur={async (html) => {
            if ((note?.notes ?? "") === html) {
              // Even if unchanged, still try to materialize any new mentions (idempotent via dedup)
            } else {
              try {
                await saveSectionNotes({ data: { meeting_id: meetingId, section_key: section.key, notes: html, executive_session: isExec } });
              } catch (e: any) {
                toast.error(e.message ?? "Failed");
                return;
              }
            }
            const mentions = extractMentions(html);
            if (mentions.length > 0) {
              try {
                const res: any = await createActionsFromMentions({
                  data: { meeting_id: meetingId, executive_session: isExec, mentions },
                });
                if (res?.created > 0) {
                  toast.success(`Created ${res.created} action item${res.created === 1 ? "" : "s"} from mentions`);
                  reload();
                }
              } catch (e: any) {
                toast.error(e.message ?? "Failed to create action items");
              }
            }
          }}
        />
      </div>
    </CollapsibleCard>
  );
}

function CollapsibleCard({
  storageKey,
  header,
  children,
  className,
  defaultOpen = true,
}: {
  storageKey: string;
  header: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(storageKey);
    if (v === "0") return false;
    if (v === "1") return true;
    return defaultOpen;
  });
  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try { window.localStorage.setItem(storageKey, next ? "1" : "0"); } catch {}
      return next;
    });
  };
  return (
    <div className={`bg-surface border rounded-2xl ${className ?? "border-border"}`}>
      <button
        type="button"
        onClick={toggle}
        className={`w-full flex items-center gap-2 px-4 py-3 font-medium text-sm text-left ${open ? "border-b border-border" : ""} hover:bg-muted/40 rounded-t-2xl ${open ? "" : "rounded-b-2xl"}`}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">{header}</div>
      </button>
      {open && children}
    </div>
  );
}

/** Renders an agenda item title. Supports rich-text HTML and legacy plain text / [label](url) markdown. */
function AgendaTitle({ value, className }: { value: string; className?: string }) {
  if (!value) return null;
  const looksHtml = /<[a-z][\s\S]*>/i.test(value);
  if (looksHtml) {
    return <RichTextView html={value} className={className} />;
  }
  return <div className={className}><LinkedText value={value} /></div>;
}

function SortableAgendaList({
  items,
  onReorder,
  renderItem,
}: {
  items: any[];
  onReorder: (items: any[]) => void;
  renderItem: (item: any) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = items.map((i) => i.id);
  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(items, oldIdx, newIdx));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function AgendaItemRow({ item, isFullElder, reload, meetingId }: any) {
  const isNewBusiness = item.section_key === "new_business";
  const willCarry = isNewBusiness || !!item.carry_to_next;
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraftTitle(item.title ?? ""); }, [item.title]);

  async function saveEdit() {
    const plain = draftTitle.replace(/<[^>]+>/g, "").trim();
    if (!plain) { toast.error("Title cannot be empty"); return; }
    setSaving(true);
    try {
      await upsertAgendaItem({
        data: {
          id: item.id,
          meeting_id: meetingId,
          section_key: item.section_key,
          title: draftTitle,
        },
      });
      setEditing(false);
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <RichTextEditor value={draftTitle} onChange={setDraftTitle} minHeight={40} />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveEdit} disabled={saving}>
            <Check className="w-3 h-3 mr-1" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraftTitle(item.title ?? ""); }}>
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 group">
      <div className="flex-1 min-w-0">
        <AgendaTitle value={item.title} className="text-sm" />
        {item.body && <AgendaTitle value={item.body} className="text-xs text-muted-foreground mt-0.5" />}
        <div className="flex gap-2 mt-0.5">
          {item.source && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {item.source === "carryover" ? "Carried over" : item.source}
            </div>
          )}
          {willCarry && (
            <div className="text-[10px] uppercase tracking-wider text-primary">
              {isNewBusiness ? "Auto-carries to next" : "Will carry to next"}
            </div>
          )}
        </div>
      </div>
      <button
        title="Edit item"
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        title={
          isNewBusiness
            ? "New Business always carries to next meeting"
            : item.carry_to_next
              ? "Don't carry to next meeting"
              : "Carry to next meeting follow-up"
        }
        disabled={isNewBusiness}
        onClick={async () => {
          if (isNewBusiness) return;
          await setAgendaCarryToNext({ data: { id: item.id, carry: !item.carry_to_next } });
          reload();
        }}
        className={`opacity-0 group-hover:opacity-100 ${willCarry ? "!opacity-100 text-primary" : "text-muted-foreground hover:text-foreground"} ${isNewBusiness ? "cursor-default" : ""}`}
      >
        <Bookmark className={`w-3.5 h-3.5 ${willCarry ? "fill-current" : ""}`} />
      </button>
      {isFullElder && (
        <button
          title={item.executive_session ? "Make standard" : "Mark Executive"}
          onClick={async () => {
            await setAgendaExecutive({ data: { id: item.id, executive: !item.executive_session } });
            reload();
          }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
        >
          {item.executive_session ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      )}
      <button
        onClick={async () => {
          if (!confirm("Delete item?")) return;
          await deleteAgendaItem({ data: { id: item.id } });
          reload();
        }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function JointSections({ meetingId, items, reload, mentionUsers, canEdit }: any) {
  return (
    <div className="bg-surface border border-[oklch(0.55_0.15_280)]/30 ring-1 ring-[oklch(0.55_0.15_280)]/15 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold">Deacons & Elders</h3>
        <span className="text-[10px] uppercase tracking-wider text-[oklch(0.55_0.15_280)]">Joint Section</span>
      </div>
      <div className="space-y-4">
        {JOINT_SUBSECTIONS.map((s) => {
          const subItems = items.filter((i: any) => i.sub_section === s.key);
          return (
            <JointSubSection
              key={s.key}
              sub={s}
              meetingId={meetingId}
              items={subItems}
              reload={reload}
              mentionUsers={mentionUsers}
              canEdit={canEdit}
            />
          );
        })}
      </div>
    </div>
  );
}

function JointSubSection({ sub, meetingId, items, reload, mentionUsers }: any) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function add() {
    if (!title.trim()) return;
    try {
      await upsertJointItem({
        data: { meeting_id: meetingId, sub_section: sub.key, title: title.trim(), body: body || null },
      });
      const mentions = extractMentions(body);
      if (mentions.length > 0) {
        try {
          const res: any = await createActionsFromMentions({
            data: { meeting_id: meetingId, mentions },
          });
          if (res?.created > 0) {
            toast.success(`Created ${res.created} action item${res.created === 1 ? "" : "s"} from mentions`);
          }
        } catch (e: any) {
          toast.error(e.message ?? "Failed to create action items");
        }
      }
      setTitle(""); setBody("");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <CollapsibleCard
      storageKey={`elder-collapsed:${meetingId}:joint:${sub.key}`}
      header={<><span>{sub.label}</span><span className="text-[10px] text-muted-foreground ml-1">({items.length})</span></>}
    >
      <div className="p-4 space-y-3">
        {items.map((it: any) => (
          <div key={it.id} className="border border-border rounded-lg p-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium flex-1">{it.title}</div>
              <button
                onClick={async () => { if (!confirm("Delete?")) return; await deleteJointItem({ data: { id: it.id } }); reload(); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {it.body && <RichTextView html={it.body} className="mt-1 text-xs text-muted-foreground" />}
          </div>
        ))}
        <div className="space-y-2">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
          <RichTextEditor value={body} onChange={setBody} placeholder="Notes (optional · type @ to assign a task)" minHeight={72} mentionUsers={mentionUsers} />
          <Button size="sm" variant="outline" onClick={add}><Plus className="w-3 h-3 mr-1" /> Add</Button>
        </div>
      </div>
    </CollapsibleCard>
  );
}

function ActionItemsBlock({ meetingId, items, isFullElder, reload }: any) {
  const [title, setTitle] = useState("");
  const [exec, setExec] = useState(false);

  async function add() {
    if (!title.trim()) return;
    try {
      await createElderAction({ data: { meeting_id: meetingId, title: title.trim(), executive_session: exec } });
      setTitle(""); setExec(false);
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <CollapsibleCard
      storageKey={`elder-collapsed:${meetingId}:action-items`}
      header={<><span>Action items</span><span className="text-[10px] text-muted-foreground ml-1">({items.length})</span></>}
    >
      <div className="p-4 space-y-2">
        {items.length === 0 && <div className="text-xs text-muted-foreground">None yet.</div>}
        {items.map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 group">
            <button
              onClick={async () => {
                await updateElderAction({ data: { id: a.id, completed: !a.completed } });
                reload();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {a.completed ? <Check className="w-4 h-4 text-[oklch(0.55_0.15_280)]" /> : <Square className="w-4 h-4" />}
            </button>
            <div className={`flex-1 text-sm ${a.completed ? "line-through text-muted-foreground" : ""}`}>{a.title}</div>
            {a.executive_session && <Lock className="w-3 h-3 text-[oklch(0.55_0.15_280)]" />}
            <button
              onClick={async () => { if (!confirm("Delete?")) return; await deleteElderAction({ data: { id: a.id } }); reload(); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Input placeholder="New action item…" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
          {isFullElder && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={exec} onChange={(e) => setExec(e.target.checked)} />
              Exec
            </label>
          )}
          <Button size="sm" variant="outline" onClick={add}><Plus className="w-3 h-3" /></Button>
        </div>
      </div>
    </CollapsibleCard>
  );
}
