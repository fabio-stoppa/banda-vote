import { spotifySearchUrl, youtubeMusicUrl } from "../lib/playlists";
import type { Track } from "../lib/types";
import { LikeIcon } from "./LikeIcon";

type Props = {
  track: Track;
  votes: number;
  voted: boolean;
  busy: boolean;
  playing: boolean;
  onPlay: () => void;
  onToggle: () => void;
};

function thumbUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function TrackRow({
  track,
  votes,
  voted,
  busy,
  playing,
  onPlay,
  onToggle,
}: Props) {
  const yt = youtubeMusicUrl(track.videoId);
  const spotify = spotifySearchUrl(track.artist, track.title);

  return (
    <li className={`track${voted ? " voted" : ""}${playing ? " playing" : ""}`}>
      <div className="track-main">
        <button
          type="button"
          className={`cover-btn${playing ? " playing" : ""}`}
          onClick={onPlay}
          aria-pressed={playing}
          aria-label={playing ? `Parar ${track.title}` : `Ouvir ${track.title}`}
          title={playing ? "Parar" : "Ouvir"}
        >
          <img
            className="cover"
            src={thumbUrl(track.videoId)}
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span className="cover-play" aria-hidden="true">
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
              </svg>
            )}
          </span>
        </button>
        <div className="track-body">
          <p className="track-title">{track.title}</p>
          <p className="track-artist">{track.artist}</p>
          <div className="track-links">
            <a className="badge badge-yt" href={yt} target="_blank" rel="noreferrer">
              YouTube
            </a>
            <a
              className="badge badge-spotify"
              href={spotify}
              target="_blank"
              rel="noreferrer"
            >
              Spotify
            </a>
          </div>
        </div>
      </div>
      <div className="track-actions">
        <button
          type="button"
          className={`like-btn${voted ? " liked" : ""}`}
          onClick={onToggle}
          disabled={busy}
          aria-pressed={voted}
          aria-label={voted ? "Remover curtida" : "Curtir"}
          title={voted ? "Remover curtida" : "Curtir"}
        >
          <LikeIcon filled={voted} />
        </button>
        <span className="votes" aria-label={`${votes} votos`}>
          {votes}
        </span>
      </div>
    </li>
  );
}
