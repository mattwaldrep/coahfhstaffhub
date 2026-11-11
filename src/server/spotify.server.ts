// Server-only Spotify Web API helpers for the shared church playlist sync.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SPOTIFY_PLAYLIST_ID = "1zQhisxPIz6LkXS8WUuJ4G";
export const SPOTIFY_REDIRECT_URI = "https://coahfhstaffhub.lovable.app/api/public/spotify/callback";
export const SPOTIFY_SCOPE = "playlist-modify-public playlist-modify-private playlist-read-private";
export const SPOTIFY_PROVIDER = "spotify";

export function spotifyEnv() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify is not configured.");
  return { id, secret, basic: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` };
}

async function loadConnection() {
  const { data, error } = await supabaseAdmin.from("user_integrations")
    .select("id,refresh_token,access_token,expires_at")
    .eq("provider", SPOTIFY_PROVIDER).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function spotifyConnected() {
  return !!(await loadConnection());
}

export async function spotifyToken(): Promise<string> {
  const row = await loadConnection();
  if (!row) throw new Error("Spotify isn't connected yet.");
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) {
    return row.access_token;
  }
  const { basic } = spotifyEnv();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) throw new Error(`Spotify sign-in expired (${res.status}). Reconnect Spotify.`);
  await supabaseAdmin.from("user_integrations").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
  }).eq("id", row.id);
  return tok.access_token;
}

async function api(path: string, init?: RequestInit) {
  const token = await spotifyToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

export type SpotifyTrack = { uri: string; name: string; artists: string; album: string; url: string };

function mapTrack(t: any): SpotifyTrack {
  return {
    uri: t.uri, name: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name).join(", "),
    album: t.album?.name ?? "", url: t.external_urls?.spotify ?? "",
  };
}

export async function searchTracks(title: string, artist: string | null): Promise<SpotifyTrack[]> {
  const queries = artist ? [`track:${title} artist:${artist}`, `${title} ${artist}`] : [`track:${title}`];
  for (const q of queries) {
    const json: any = await api(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
    const items = (json?.tracks?.items ?? []).map(mapTrack);
    if (items.length) return items;
  }
  return [];
}

export async function replacePlaylist(uris: string[]) {
  await api(`/playlists/${SPOTIFY_PLAYLIST_ID}/items`, { method: "PUT", body: JSON.stringify({ uris: uris.slice(0, 100) }) });
}

export async function playlistName(): Promise<string> {
  const json: any = await api(`/playlists/${SPOTIFY_PLAYLIST_ID}?fields=name`);
  return json?.name ?? "Playlist";
}
