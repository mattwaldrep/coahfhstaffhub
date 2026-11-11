import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Music } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSpotifyAuthUrl, getSpotifyStatus, previewSpotifySync, replaceSpotifyPlaylist, type SpotifyPreviewSong } from "@/lib/spotify.functions";

export function SpotifySyncButton({ sundayIso }: { sundayIso: string }) {
  const statusFn = useServerFn(getSpotifyStatus);
  const authFn = useServerFn(getSpotifyAuthUrl);
  const previewFn = useServerFn(previewSpotifySync);
  const replaceFn = useServerFn(replaceSpotifyPlaylist);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songs, setSongs] = useState<SpotifyPreviewSong[]>([]);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [meta, setMeta] = useState<{ plan?: string; playlist?: string }>({});

  useEffect(() => {
    statusFn().then((r) => setConnected(r.connected)).catch(() => setConnected(null));
    const p = new URLSearchParams(window.location.search).get("spotify");
    if (p === "connected") toast.success("Spotify connected.");
    if (p === "error") toast.error("Spotify connection didn't finish. Try again.");
  }, [statusFn]);

  async function connect() {
    try { window.location.href = (await authFn()).url; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start Spotify sign-in."); }
  }

  async function openReview() {
    setOpen(true); setLoading(true); setError(null); setSongs([]);
    const r = await previewFn({ data: { sundayIso } }).catch((e) => ({ ok: false, error: String(e?.message ?? e) }) as const);
    setLoading(false);
    if (!r.ok || !("songs" in r) || !r.songs) { setError(r.error ?? "Couldn't load songs."); return; }
    setSongs(r.songs);
    setMeta({ plan: r.planTitle, playlist: r.playlist });
    setChoice(Object.fromEntries(r.songs.map((s, i) => [i, s.matches[0]?.uri ?? ""])));
  }

  async function replace() {
    const uris = songs.map((_, i) => choice[i]).filter(Boolean);
    if (!uris.length) return;
    setSaving(true);
    const r = await replaceFn({ data: { uris } });
    setSaving(false);
    if (r.ok) { toast.success(`Playlist updated with ${r.count} song${r.count === 1 ? "" : "s"}.`); setOpen(false); }
    else toast.error(r.error);
  }

  if (connected === null) return null;
  if (!connected) {
    return (
      <Button size="sm" variant="outline" onClick={connect}>
        <Music className="w-3.5 h-3.5 mr-1.5" /> Connect Spotify
      </Button>
    );
  }
  const selected = songs.filter((_, i) => choice[i]).length;
  return (
    <>
      <Button size="sm" variant="outline" onClick={openReview}>
        <Music className="w-3.5 h-3.5 mr-1.5" /> Sync to Spotify
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync Sunday songs to Spotify</DialogTitle>
            <DialogDescription>
              {meta.plan ? `${meta.plan} → "${meta.playlist}". ` : ""}Check each match, then replace the playlist. Songs already on it will be removed.
            </DialogDescription>
          </DialogHeader>
          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" /> Finding songs…</div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <ol className="space-y-3">
            {songs.map((s, i) => (
              <li key={i} className="rounded-md border p-3 space-y-1.5">
                <div className="text-sm font-medium">{i + 1}. {s.title}</div>
                <div className="text-xs text-muted-foreground">
                  {[s.author, s.arrangement && `Arrangement: ${s.arrangement}`].filter(Boolean).join(" · ") || "No artist listed in Planning Center"}
                </div>
                {s.matches.length ? (
                  <select
                    aria-label={`Spotify match for ${s.title}`}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    value={choice[i] ?? ""}
                    onChange={(e) => setChoice((c) => ({ ...c, [i]: e.target.value }))}
                  >
                    {s.matches.map((m) => <option key={m.uri} value={m.uri}>{m.name} — {m.artists} ({m.album})</option>)}
                    <option value="">Skip this song</option>
                  </select>
                ) : <p className="text-xs text-destructive">Not found on Spotify — will be skipped.</p>}
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={replace} disabled={saving || loading || selected === 0}>
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Replace playlist ({selected})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
