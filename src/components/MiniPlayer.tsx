import { useEffect, useRef, useState } from "react";
import type { Track } from "../lib/types";
import { loadYouTubeApi, type YtPlayer } from "../lib/youtube";

type Props = {
  track: Track;
  onClose: () => void;
};

function thumbUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MiniPlayer({ track, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let tickId = 0;
    let player: YtPlayer | null = null;

    setCurrent(0);
    setDuration(0);

    void loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;

      player = new YT.Player(hostRef.current, {
        videoId: track.videoId,
        width: 200,
        height: 113,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          controls: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event) => {
            event.target.playVideo();
            const d = event.target.getDuration();
            if (d) setDuration(d);
            tickId = window.setInterval(() => {
              try {
                setCurrent(event.target.getCurrentTime());
                const nextDuration = event.target.getDuration();
                if (nextDuration) setDuration(nextDuration);
              } catch {
                /* player torn down */
              }
            }, 250);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      window.clearInterval(tickId);
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [track.videoId]);

  function seek(clientX: number, target: HTMLElement) {
    if (!duration || !playerRef.current) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = ratio * duration;
    playerRef.current.seekTo(next, true);
    setCurrent(next);
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="mini-player" role="region" aria-label={`Tocando ${track.title}`}>
      <div className="mini-player-embed" aria-hidden="true">
        <div ref={hostRef} />
      </div>

      <div className="mini-player-row">
        <img
          className="mini-player-cover"
          src={thumbUrl(track.videoId)}
          alt=""
          width={36}
          height={36}
          decoding="async"
        />
        <div className="mini-player-meta">
          <p className="mini-player-title">{track.title}</p>
          <p className="mini-player-artist">{track.artist}</p>
        </div>
        <span className="mini-player-time" aria-hidden="true">
          {formatTime(current)}
          <span className="mini-player-time-sep">/</span>
          {formatTime(duration)}
        </span>
        <button
          type="button"
          className="mini-player-close"
          onClick={onClose}
          aria-label="Parar reprodução"
          title="Parar"
        >
          ✕
        </button>
      </div>

      <div
        className="mini-player-progress"
        role="slider"
        tabIndex={0}
        aria-label="Posição da música"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration) || 0}
        aria-valuenow={Math.floor(current)}
        aria-valuetext={`${formatTime(current)} de ${formatTime(duration)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX, e.currentTarget);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          seek(e.clientX, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (!duration || !playerRef.current) return;
          const step = e.shiftKey ? 10 : 5;
          let next = current;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(duration, current + step);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, current - step);
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = duration;
          else return;
          e.preventDefault();
          playerRef.current.seekTo(next, true);
          setCurrent(next);
        }}
      >
        <div className="mini-player-progress-track">
          <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
