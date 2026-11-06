import { useCallback, useEffect, useMemo, useState } from "react";
import { MiniPlayer } from "./components/MiniPlayer";
import { TrackRow } from "./components/TrackRow";
import { PLAYLISTS } from "./lib/playlists";
import type { PlaylistData, PlaylistMeta, Track, VotesResponse } from "./lib/types";
import { getVoterId } from "./lib/voter";

async function fetchVotes(playlistId: string, voterId: string): Promise<VotesResponse> {
  const res = await fetch(
    `/api/votes/${encodeURIComponent(playlistId)}?voterId=${encodeURIComponent(voterId)}`,
  );
  if (!res.ok) throw new Error("Falha ao carregar votos");
  return res.json();
}

async function fetchPlaylist(playlistId: string, refresh = false): Promise<PlaylistData> {
  const qs = refresh ? "?refresh=1" : "";
  const res = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}${qs}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Não foi possível carregar a playlist");
  }
  return res.json();
}

/** Static snapshot used if the API is down. */
async function fetchFallbackPlaylist(m: PlaylistMeta): Promise<PlaylistData> {
  const res = await fetch(m.dataFile);
  if (!res.ok) throw new Error("Não foi possível carregar a playlist");
  return res.json();
}

function tracksFingerprint(data: PlaylistData) {
  return data.tracks.map((t) => `${t.videoId}\0${t.title}\0${t.artist}`).join("\n");
}

export default function App() {
  const [activeId, setActiveId] = useState(PLAYLISTS[0].id);
  const meta = PLAYLISTS.find((p) => p.id === activeId) ?? PLAYLISTS[0];

  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const voterId = useMemo(() => getVoterId(), []);

  function playTrack(track: Track) {
    setPlaying((current) =>
      current?.videoId === track.videoId ? null : track,
    );
  }

  const loadPlaylist = useCallback(async (m: PlaylistMeta) => {
    setLoading(true);
    setError(null);
    try {
      const [dataRes, votes] = await Promise.all([
        fetchPlaylist(m.id).catch(() => fetchFallbackPlaylist(m)),
        fetchVotes(m.id, voterId),
      ]);
      setPlaylist(dataRes);
      setCounts(votes.counts);
      setMine(new Set(votes.mine));

      // Background revalidate — rate-limited on the server.
      void fetchPlaylist(m.id, true)
        .then((fresh) => {
          if (tracksFingerprint(fresh) !== tracksFingerprint(dataRes)) {
            setPlaylist(fresh);
          }
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
      setPlaylist(null);
    } finally {
      setLoading(false);
    }
  }, [voterId]);

  useEffect(() => {
    void loadPlaylist(meta);
  }, [meta, loadPlaylist]);

  // Soft refresh so other people's votes show up without a full reload.
  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchVotes(meta.id, voterId)
        .then((votes) => {
          setCounts(votes.counts);
          setMine(new Set(votes.mine));
        })
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(id);
  }, [meta.id, voterId]);

  const sorted = useMemo(() => {
    if (!playlist) return [];
    return [...playlist.tracks].sort((a, b) => {
      const va = counts[a.videoId] ?? 0;
      const vb = counts[b.videoId] ?? 0;
      if (vb !== va) return vb - va;
      return a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
    });
  }, [playlist, counts]);

  async function toggle(videoId: string) {
    if (busyId) return;
    setBusyId(videoId);
    setError(null);

    const wasMine = mine.has(videoId);
    const prevCount = counts[videoId] ?? 0;

    // Optimistic update
    setMine((prev) => {
      const next = new Set(prev);
      if (wasMine) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
    setCounts((prev) => ({
      ...prev,
      [videoId]: Math.max(0, prevCount + (wasMine ? -1 : 1)),
    }));

    try {
      const res = await fetch(`/api/votes/${encodeURIComponent(meta.id)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, voterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao votar");
      setCounts(data.counts);
      setMine(new Set(data.mine));
    } catch (err) {
      // Rollback
      setMine((prev) => {
        const next = new Set(prev);
        if (wasMine) next.add(videoId);
        else next.delete(videoId);
        return next;
      });
      setCounts((prev) => ({ ...prev, [videoId]: prevCount }));
      setError(err instanceof Error ? err.message : "Erro ao votar");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={`app${playing ? " has-player" : ""}`}>
      <nav className="tabs" aria-label="Playlists">
        {PLAYLISTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`tab${p.id === meta.id ? " active" : ""}`}
            onClick={() => setActiveId(p.id)}
          >
            {p.tabLabel}
          </button>
        ))}
      </nav>

      <header className="header">
        <h1>{meta.heading}</h1>
        <ul className="notes">
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <a
          className="playlist-link"
          href={meta.playlistUrl}
          target="_blank"
          rel="noreferrer"
        >
          Playlist no YouTube Music →
        </a>
      </header>

      {error && <p className="status-line">{error}</p>}
      {loading && !error && <p className="status-line muted">Carregando…</p>}

      {!loading && playlist && (
        <ul className="track-list">
          {sorted.map((track) => (
            <TrackRow
              key={track.videoId}
              track={track}
              votes={counts[track.videoId] ?? 0}
              voted={mine.has(track.videoId)}
              busy={busyId === track.videoId}
              playing={playing?.videoId === track.videoId}
              onPlay={() => playTrack(track)}
              onToggle={() => void toggle(track.videoId)}
            />
          ))}
        </ul>
      )}

      {playing && (
        <MiniPlayer track={playing} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
