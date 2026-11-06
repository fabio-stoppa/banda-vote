import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FALLBACK_DIR = path.join(ROOT, "public", "data");
const FILE_CACHE = process.env.PLAYLIST_CACHE_FILE || path.join(ROOT, ".data", "playlist-cache.json");

/** Global safety net: at most one YouTube fetch per playlist every N ms. */
const MIN_FETCH_INTERVAL_MS = Number(process.env.PLAYLIST_FETCH_MIN_MS) || 3 * 60 * 1000;

/** @type {Record<string, { youtubeId: string, url: string, fallbackFile: string }>} */
export const PLAYLIST_CATALOG = {
  "banda-2": {
    youtubeId: "PLTw6uHoXGtqw",
    url: "https://music.youtube.com/playlist?list=PLTw6uHoXGtqw",
    fallbackFile: "banda-2.json",
  },
  "banda-3": {
    youtubeId: "PLUCIptOsJlKM",
    url: "https://music.youtube.com/playlist?list=PLUCIptOsJlKM",
    fallbackFile: "banda-3.json",
  },
};

/** @type {Map<string, number>} */
const memoryLastFetch = new Map();
/** @type {Map<string, object>} */
const memoryCache = new Map();

function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function cacheKey(playlistId) {
  return `playlist:data:${playlistId}`;
}

function lastFetchKey(playlistId) {
  return `playlist:lastFetch:${playlistId}`;
}

function readFallback(playlistId) {
  const meta = PLAYLIST_CATALOG[playlistId];
  if (!meta) return null;
  const file = path.join(FALLBACK_DIR, meta.fallbackFile);
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      title: raw.title,
      url: raw.url || meta.url,
      tracks: raw.tracks,
      source: "fallback",
      updatedAt: null,
    };
  } catch {
    return null;
  }
}

function fileCacheLoad() {
  try {
    return JSON.parse(fs.readFileSync(FILE_CACHE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function fileCacheSave(data) {
  fs.mkdirSync(path.dirname(FILE_CACHE), { recursive: true });
  const tmp = `${FILE_CACHE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE_CACHE);
}

async function readCache(playlistId) {
  const redis = redisClient();
  if (redis) {
    const cached = await redis.get(cacheKey(playlistId));
    if (cached && typeof cached === "object") return cached;
    if (typeof cached === "string") {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (memoryCache.has(playlistId)) return memoryCache.get(playlistId);
  const file = fileCacheLoad()[playlistId];
  if (file) {
    memoryCache.set(playlistId, file);
    return file;
  }
  return null;
}

async function writeCache(playlistId, payload) {
  const redis = redisClient();
  if (redis) {
    await redis.set(cacheKey(playlistId), payload);
    return;
  }
  memoryCache.set(playlistId, payload);
  const data = fileCacheLoad();
  data[playlistId] = payload;
  fileCacheSave(data);
}

/**
 * Atomically claim a YouTube fetch slot for this playlist.
 * Returns false if another request already claimed within the window.
 */
async function claimFetchSlot(playlistId) {
  const now = Date.now();
  const redis = redisClient();
  if (redis) {
    const result = await redis.set(lastFetchKey(playlistId), now, {
      nx: true,
      px: MIN_FETCH_INTERVAL_MS,
    });
    return result === "OK" || result === true;
  }

  const last = memoryLastFetch.get(playlistId) ?? 0;
  if (last && now - last < MIN_FETCH_INTERVAL_MS) return false;
  memoryLastFetch.set(playlistId, now);
  return true;
}

async function releaseFetchSlot(playlistId) {
  const redis = redisClient();
  if (redis) {
    await redis.del(lastFetchKey(playlistId));
    return;
  }
  memoryLastFetch.delete(playlistId);
}

function stripTopic(name) {
  return String(name || "")
    .replace(/\s*-\s*Topic\s*$/i, "")
    .trim();
}

async function fetchFromYouTube(youtubeId, displayUrl) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    const err = new Error("YOUTUBE_API_KEY não configurada");
    err.status = 503;
    throw err;
  }

  const tracks = [];
  let pageToken = "";
  let title = "Playlist";

  const metaUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
  metaUrl.searchParams.set("part", "snippet");
  metaUrl.searchParams.set("id", youtubeId);
  metaUrl.searchParams.set("key", apiKey);
  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) {
    const body = await metaRes.text();
    const err = new Error(`YouTube playlists.list falhou (${metaRes.status}): ${body.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  const metaJson = await metaRes.json();
  const playlistSnippet = metaJson.items?.[0]?.snippet;
  if (playlistSnippet?.title) title = playlistSnippet.title;

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", youtubeId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`YouTube playlistItems.list falhou (${res.status}): ${body.slice(0, 200)}`);
      err.status = 502;
      throw err;
    }
    const json = await res.json();
    for (const item of json.items ?? []) {
      const snippet = item.snippet;
      if (!snippet) continue;
      const videoId = snippet.resourceId?.videoId;
      if (!videoId) continue;
      // Deleted / private placeholders
      if (snippet.title === "Deleted video" || snippet.title === "Private video") continue;

      const artist =
        stripTopic(snippet.videoOwnerChannelTitle) ||
        stripTopic(snippet.channelTitle) ||
        "Desconhecido";

      tracks.push({
        index: tracks.length + 1,
        title: String(snippet.title || "Sem título").trim(),
        artist,
        videoId,
        url: `https://music.youtube.com/watch?v=${videoId}`,
      });
    }
    pageToken = json.nextPageToken || "";
  } while (pageToken);

  return {
    title,
    url: displayUrl,
    tracks,
    source: "youtube",
    updatedAt: Date.now(),
  };
}

/**
 * Return cached playlist (Redis / local file / static fallback). Never hits YouTube.
 */
export async function getPlaylist(playlistId) {
  if (!PLAYLIST_CATALOG[playlistId]) {
    const err = new Error("playlistId inválido");
    err.status = 400;
    throw err;
  }

  const cached = await readCache(playlistId);
  if (cached?.tracks) {
    return {
      title: cached.title,
      url: cached.url,
      tracks: cached.tracks,
      source: cached.source || "cache",
      updatedAt: cached.updatedAt ?? null,
      revalidated: false,
      rateLimited: false,
    };
  }

  const fallback = readFallback(playlistId);
  if (!fallback) {
    const err = new Error("Playlist não encontrada");
    err.status = 404;
    throw err;
  }
  return { ...fallback, revalidated: false, rateLimited: false };
}

/**
 * Revalidate from YouTube if the global rate limit allows.
 * Always returns the best available playlist payload.
 */
export async function refreshPlaylist(playlistId) {
  const meta = PLAYLIST_CATALOG[playlistId];
  if (!meta) {
    const err = new Error("playlistId inválido");
    err.status = 400;
    throw err;
  }

  if (!process.env.YOUTUBE_API_KEY) {
    const current = await getPlaylist(playlistId);
    return {
      ...current,
      revalidated: false,
      rateLimited: false,
      refreshError: "YOUTUBE_API_KEY não configurada",
    };
  }

  const claimed = await claimFetchSlot(playlistId);
  if (!claimed) {
    const current = await getPlaylist(playlistId);
    return { ...current, revalidated: false, rateLimited: true };
  }

  try {
    const fresh = await fetchFromYouTube(meta.youtubeId, meta.url);
    await writeCache(playlistId, fresh);
    return { ...fresh, revalidated: true, rateLimited: false };
  } catch (err) {
    // Allow a retry sooner if the fetch itself failed.
    await releaseFetchSlot(playlistId);
    const current = await getPlaylist(playlistId);
    return {
      ...current,
      revalidated: false,
      rateLimited: false,
      refreshError: err.message || "Falha ao atualizar no YouTube",
    };
  }
}
