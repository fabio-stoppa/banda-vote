import { getVotes, toggleVote } from "../../server/store.js";

export default async function handler(req, res) {
  const playlistId = req.query.playlistId;
  if (typeof playlistId !== "string" || !playlistId) {
    return res.status(400).json({ error: "playlistId inválido" });
  }

  try {
    if (req.method === "GET") {
      const voterId = typeof req.query.voterId === "string" ? req.query.voterId : "";
      return res.status(200).json(await getVotes(playlistId, voterId));
    }

    if (req.method === "POST") {
      // Prefer /api/votes/:id/toggle, but allow POST here too.
      const { videoId, voterId } = req.body ?? {};
      return res.status(200).json(await toggleVote(playlistId, videoId, voterId));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error:
        status === 400
          ? err.message
          : "Não foi possível processar os votos. Conecte o Upstash Redis na Vercel.",
    });
  }
}
