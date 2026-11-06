import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlaylist, refreshPlaylist } from "./playlists.js";
import { getVotes, toggleVote } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 4321;

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/playlists/:playlistId", async (req, res) => {
  try {
    const refresh =
      req.query.refresh === "1" ||
      req.query.refresh === "true" ||
      req.query.revalidate === "1";
    const data = refresh
      ? await refreshPlaylist(req.params.playlistId)
      : await getPlaylist(req.params.playlistId);
    res.json(data);
  } catch (err) {
    const status = err.status || 500;
    console.error(err);
    res.status(status).json({
      error:
        status === 400 || status === 404
          ? err.message
          : "Não foi possível carregar a playlist.",
    });
  }
});

app.get("/api/votes/:playlistId", async (req, res) => {
  try {
    const voterId = typeof req.query.voterId === "string" ? req.query.voterId : "";
    res.json(await getVotes(req.params.playlistId, voterId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não foi possível carregar os votos." });
  }
});

app.post("/api/votes/:playlistId/toggle", async (req, res) => {
  try {
    const { videoId, voterId } = req.body ?? {};
    res.json(await toggleVote(req.params.playlistId, videoId, voterId));
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: status === 400 ? err.message : "Não foi possível salvar o voto.",
    });
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(ROOT, "dist");
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API em http://127.0.0.1:${PORT}`);
});
