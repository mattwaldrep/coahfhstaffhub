import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchSpotifyVersions, type SpotifyPreviewSong } from "@/lib/spotify.functions";

type Track = SpotifyPreviewSong["matches"][number];

export function SpotifyVersionSearch({ title, selectedUri, disabled, onSelect }: {
  title: string;
  selectedUri: string;
  disabled: boolean;
  onSelect: (track: Track) => void;
}) {
  const searchFn = useServerFn(searchSpotifyVersions);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim() || loading || disabled) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(false);
    try {
      const result = await searchFn({ data: { query: query.trim() } });
      if (result.ok) { setResults(result.tracks); setSearched(true); }
      else setError(result.error);
    } catch { setError("Couldn't search Spotify. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <Search className="mr-1.5 size-3.5" /> {expanded ? "Close search" : "Search for another version"}
      </Button>
      {expanded && <div className="space-y-2">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Input aria-label={`Search Spotify for ${title}`} placeholder="Song, artist, or album" value={query} maxLength={200} disabled={loading || disabled} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" variant="outline" size="icon" title="Search Spotify" aria-label={`Search versions of ${title}`} disabled={loading || disabled || !query.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </form>
        <div aria-live="polite">
          {loading && <p className="text-xs text-muted-foreground">Searching Spotify…</p>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {searched && !results.length && <p className="text-xs text-muted-foreground">No versions found. Try another song title or artist.</p>}
        </div>
        {results.length > 0 && <ul className="max-h-64 overflow-y-auto divide-y">
          {results.map((track) => <li key={track.uri} className="flex items-center gap-2 py-2">
            <Button variant="ghost" disabled={disabled} className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-2 py-1.5 text-left" aria-label={`Select ${track.name} by ${track.artists} from ${track.album}`} aria-pressed={selectedUri === track.uri} onClick={() => onSelect(track)}>
              <span className="min-w-0 flex-1 break-words"><span className="block text-sm font-medium">{track.name}</span><span className="block text-xs text-muted-foreground">{track.artists} · {track.album}</span></span>
              {selectedUri === track.uri && <Check className="ml-2 size-4 shrink-0 text-primary" />}
            </Button>
            {track.url.startsWith("https://open.spotify.com/") && <Button asChild variant="ghost" size="icon" className="shrink-0"><a href={track.url} target="_blank" rel="noopener noreferrer" title="Open in Spotify" aria-label={`Open ${track.name} in Spotify`}><ExternalLink className="size-4" /></a></Button>}
          </li>)}
        </ul>}
      </div>}
    </div>
  );
}