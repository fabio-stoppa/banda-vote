import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = process.env.VOTES_FILE || path.join(ROOT, ".data", "votes.json");

function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function countsFor(playlistVotes) {
  const counts = {};
  for (const [videoId, voters] of Object.entries(playlistVotes ?? {})) {
    counts[videoId] = voters.length;
  }
  return counts;
}

function mineFrom(playlistVotes, voterId) {
  const mine = [];
  if (!voterId) return mine;
  for (const [videoId, voters] of Object.entries(playlistVotes ?? {})) {
    if (voters.includes(voterId)) mine.push(videoId);
  }
  return mine;
}

function fileLoad() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function fileSave(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

async function redisGetPlaylist(redis, playlistId) {
  const raw = await redis.hgetall(`votes:${playlistId}`);
  if (!raw) return {};
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [videoId, value] of Object.entries(raw)) {
    if (Array.isArray(value)) out[videoId] = value.map(String);
    else if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        out[videoId] = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        out[videoId] = [];
      }
    }
  }
  return out;
}

export function storageKind() {
  return redisClient() ? "redis" : "file";
}

export async function getVotes(playlistId, voterId = "") {
  const redis = redisClient();
  let playlistVotes;
  if (redis) {
    playlistVotes = await redisGetPlaylist(redis, playlistId);
  } else {
    playlistVotes = fileLoad()[playlistId] ?? {};
  }
  return {
    counts: countsFor(playlistVotes),
    mine: mineFrom(playlistVotes, voterId),
    storage: storageKind(),
  };
}

export async function toggleVote(playlistId, videoId, voterId) {
  if (typeof videoId !== "string" || !videoId || videoId.length > 32) {
    const err = new Error("videoId inválido");
    err.status = 400;
    throw err;
  }
  if (typeof voterId !== "string" || !voterId || voterId.length > 80) {
    const err = new Error("voterId inválido");
    err.status = 400;
    throw err;
  }

  const redis = redisClient();
  let playlistVotes;
  let voted;

  if (redis) {
    playlistVotes = await redisGetPlaylist(redis, playlistId);
    const voters = new Set(playlistVotes[videoId] ?? []);
    if (voters.has(voterId)) {
      voters.delete(voterId);
      voted = false;
    } else {
      voters.add(voterId);
      voted = true;
    }
    if (voters.size === 0) {
      delete playlistVotes[videoId];
      await redis.hdel(`votes:${playlistId}`, videoId);
    } else {
      playlistVotes[videoId] = [...voters];
      await redis.hset(`votes:${playlistId}`, { [videoId]: [...voters] });
    }
  } else {
    const data = fileLoad();
    if (!data[playlistId]) data[playlistId] = {};
    playlistVotes = data[playlistId];
    const voters = new Set(playlistVotes[videoId] ?? []);
    if (voters.has(voterId)) {
      voters.delete(voterId);
      voted = false;
    } else {
      voters.add(voterId);
      voted = true;
    }
    if (voters.size === 0) delete playlistVotes[videoId];
    else playlistVotes[videoId] = [...voters];
    fileSave(data);
  }

  return {
    counts: countsFor(playlistVotes),
    mine: mineFrom(playlistVotes, voterId),
    voted,
    videoId,
    storage: storageKind(),
  };
}
