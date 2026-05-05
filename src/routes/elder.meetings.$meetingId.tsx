import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  getElderMeeting, upsertAgendaItem, deleteAgendaItem, setAgendaExecutive,
  saveSectionNotes, createElderAction, updateElderAction, deleteElderAction,
  upsertJointItem, deleteJointItem, updateElderMeeting,
  listMentionableUsers, createActionsFromMentions,
} from "@/server/elder.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, RichTextView, extractMentions } from "@/components/ui/rich-text-editor";
import type { MentionUser } from "@/components/ui/mention-list";
import { Plus, Trash2, Lock, Unlock, ChevronLeft, Check, Square } from "lucide-react";
import { toast } from "sonner";
import { PastoralCareList } from "@/components/pastoral/PastoralCareList";

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
  const { isFullElder } = useAuth();
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
      </div>

      {isJoint ? (
        <JointSections meetingId={meetingId} items={data.jointItems} reload={load} mentionUsers={mentionUsers} />
      ) : (
        <StandardSections meetingId={meetingId} agenda={data.agenda} sectionNotes={data.sectionNotes} isFullElder={isFullElder} reload={load} mentionUsers={mentionUsers} />
      )}

      <ActionItemsBlock meetingId={meetingId} items={data.actionItems} isFullElder={isFullElder} reload={load} />
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
            <div key={s.key} className="bg-surface border border-border rounded-2xl">
              <div className="px-4 py-3 border-b border-border font-medium text-sm flex items-center justify-between">
                <span>Pastoral Care</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Synced from Planning Center
                </span>
              </div>
              <div className="p-4">
                <PastoralCareList meetingId={meetingId} variant="meeting" />
              </div>
            </div>
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
    if (!adding.trim()) return;
    try {
      await upsertAgendaItem({
        data: {
          meeting_id: meetingId,
          section_key: section.key,
          title: adding.trim(),
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
    <div className={`bg-surface border rounded-2xl ${isExec ? "border-[oklch(0.55_0.15_280)]/40 ring-1 ring-[oklch(0.55_0.15_280)]/20" : "border-border"}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {isExec && <Lock className="w-3.5 h-3.5 text-[oklch(0.55_0.15_280)]" />}
          <span className="font-medium text-sm">{section.label}</span>
          {isExec && <span className="text-[10px] uppercase tracking-wider text-[oklch(0.55_0.15_280)]">Full Elders Only</span>}
        </div>
      </div>
      <div className="p-4 space-y-3">
        {items.map((item: any) => (
          <AgendaItemRow key={item.id} item={item} isFullElder={isFullElder} reload={reload} />
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="Add agenda item…"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={add}><Plus className="w-3 h-3" /></Button>
        </div>
        <RichTextEditor
          value={notes}
          onChange={setNotes}
          placeholder="Section notes…"
          minHeight={96}
          onBlur={async (html) => {
            if ((note?.notes ?? "") === html) return;
            try {
              await saveSectionNotes({ data: { meeting_id: meetingId, section_key: section.key, notes: html, executive_session: isExec } });
            } catch (e: any) {
              toast.error(e.message ?? "Failed");
            }
          }}
        />
      </div>
    </div>
  );
}

function AgendaItemRow({ item, isFullElder, reload }: any) {
  return (
    <div className="flex items-start gap-2 group">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{item.title}</div>
        {item.body && <div className="text-xs text-muted-foreground mt-0.5">{item.body}</div>}
        {item.source && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {item.source === "carryover" ? "Carried over" : item.source}
          </div>
        )}
      </div>
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

function JointSections({ meetingId, items, reload }: any) {
  return (
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
          />
        );
      })}
    </div>
  );
}

function JointSubSection({ sub, meetingId, items, reload }: any) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function add() {
    if (!title.trim()) return;
    try {
      await upsertJointItem({
        data: { meeting_id: meetingId, sub_section: sub.key, title: title.trim(), body: body.trim() || null },
      });
      setTitle(""); setBody("");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl">
      <div className="px-4 py-3 border-b border-border font-medium text-sm">{sub.label}</div>
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
          <RichTextEditor value={body} onChange={setBody} placeholder="Notes (optional)" minHeight={72} />
          <Button size="sm" variant="outline" onClick={add}><Plus className="w-3 h-3 mr-1" /> Add</Button>
        </div>
      </div>
    </div>
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
    <div className="bg-surface border border-border rounded-2xl">
      <div className="px-4 py-3 border-b border-border font-medium text-sm">Action items</div>
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
    </div>
  );
}
