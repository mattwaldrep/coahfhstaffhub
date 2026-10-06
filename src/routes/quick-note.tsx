import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listCareList, addPcoNote, logTouchpoint, getMyElderName } from "@/lib/pastoral-care.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, MessageSquare, Phone, Search, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { TextComposerDialog } from "@/components/pastoral/TextComposerDialog";

export const Route = createFileRoute("/quick-note")({
  head: () => ({
    meta: [
      { title: "Quick Note — Elder Hub" },
      { name: "description", content: "Log a pastoral care note from your phone." },
      { property: "og:title", content: "Quick Note — Elder Hub" },
      { property: "og:description", content: "Log a pastoral care note from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Care Note" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [{ rel: "apple-touch-icon", href: "/favicon.png" }],
  }),
  component: QuickNotePage,
});

type Person = { id: string; name: string; phone?: string | null; fields: Record<string, { value: string | null }> };
const KINDS = [
  { v: "in_person", l: "In person" },
  { v: "call", l: "Call" },
  { v: "text", l: "Text" },
  { v: "other", l: "Other" },
] as const;

function QuickNotePage() {
  const { user, loading, hasElderAccess } = useAuth();

  if (loading) return <Center><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Center>;
  if (!user)
    return (
      <Center>
        <p className="text-sm text-muted-foreground">Sign in to log a care note.</p>
        <Button asChild><Link to="/login" search={{ redirect: "/quick-note" }}>Sign in</Link></Button>
      </Center>
    );
  if (!hasElderAccess)
    return (
      <Center>
        <ShieldAlert className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Quick notes are for elders only.</p>
        <Button asChild variant="outline"><Link to="/">Back home</Link></Button>
      </Center>
    );
  return <QuickNoteForm />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">{children}</div>;
}

function QuickNoteForm() {
  const [people, setPeople] = useState<Person[]>([]);
  const [elderField, setElderField] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["v"]>("in_person");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    Promise.all([listCareList({ data: {} }), getMyElderName()])
      .then(([res, me]: any) => {
        setPeople(res.people ?? []);
        setElderField(res.fields?.assigned_elder ?? null);
        setMyName(me?.full_name ?? null);
      })
      .catch((e) => toast.error(e?.message ?? "Couldn't load the care list"))
      .finally(() => setLoadingList(false));
  }, []);

  const isMine = (p: Person) => {
    if (!elderField || !myName) return false;
    const v = (p.fields[elderField]?.value ?? "").toLowerCase();
    return !!v && v.includes(myName.toLowerCase().split(" ")[0]) && v.includes(myName.toLowerCase().split(" ").slice(-1)[0]);
  };

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? people.filter((p) => p.name.toLowerCase().includes(term)) : people.filter(isMine);
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
  }, [q, people, elderField, myName]);

  async function save() {
    if (!person || !body.trim()) return;
    setSaving(true);
    try {
      const res: any = await addPcoNote({ data: { pco_person_id: person.id, body: body.trim() } });
      await logTouchpoint({ data: { pco_person_id: person.id, person_name: person.name, kind, note: body.trim().slice(0, 2000) } });
      if (res?.pco_warning) toast.warning(`Saved in the hub, but Planning Center didn't accept it: ${res.pco_warning}`);
      setDone(person.name);
      setBody("");
      setPerson(null);
      setQ("");
      setTimeout(() => setDone(null), 2500);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col max-w-lg mx-auto px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
      <header className="flex items-center justify-between py-2">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-primary font-semibold">Elder Hub</div>
          <h1 className="text-xl font-display font-bold">Quick care note</h1>
        </div>
        <Link to="/elder/pastoral-care" className="text-xs text-muted-foreground underline">Full care list</Link>
      </header>

      {done && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-primary" /> Note saved for {done}.
        </div>
      )}

      <section className="mt-4 space-y-2">
        <label className="text-sm font-medium">Who is this about?</label>
        {person ? (
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{person.name}</span>
              <Button size="icon" variant="ghost" onClick={() => setPerson(null)} aria-label="Change person"><X className="w-4 h-4" /></Button>
            </div>
            {person.phone ? (
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-12" onClick={() => setComposerOpen(true)}>
                  <MessageSquare className="w-4 h-4 mr-2" /> Text
                </Button>
                <Button asChild variant="outline" className="h-12">
                  <a href={`tel:${person.phone}`} onClick={() => setKind("call")}><Phone className="w-4 h-4 mr-2" /> Call</a>
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No phone number in Planning Center.</p>
            )}
            {person.phone && (
              <TextComposerDialog
                open={composerOpen}
                onOpenChange={setComposerOpen}
                personId={person.id}
                personName={person.name}
                phone={person.phone}
                onSent={() => { setKind("text"); toast.success("Text logged on their card"); }}
              />
            )}
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="pl-9 h-12 text-base" />
            </div>
            {!q && <p className="text-xs text-muted-foreground">Your assigned people — or search anyone on the care list.</p>}
            <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
              {loadingList ? (
                <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : results.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No matches</div>
              ) : (
                results.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPerson(p)} className="w-full text-left px-3 py-3 text-base hover:bg-muted active:bg-muted">
                    {p.name}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </section>

      <section className="mt-5 space-y-2">
        <label className="text-sm font-medium">How did you connect?</label>
        <div className="grid grid-cols-4 gap-2">
          {KINDS.map((k) => (
            <Button key={k.v} type="button" variant={kind === k.v ? "default" : "outline"} className="h-11 px-1 text-xs" onClick={() => setKind(k.v)}>
              {k.l}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-5 space-y-2 flex-1">
        <label className="text-sm font-medium">Update</label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Type or tap the mic on your keyboard to dictate…" className="text-base" />
      </section>

      <Button className="mt-5 h-14 text-base" disabled={!person || !body.trim() || saving} onClick={save}>
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save note"}
      </Button>
      <p className="mt-2 text-[11px] text-center text-muted-foreground">Saved to their card and to Planning Center Shepherding Notes.</p>
    </div>
  );
}
