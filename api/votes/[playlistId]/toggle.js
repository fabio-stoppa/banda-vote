import { toggleVote } from "../../../server/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const playlistId = req.query.playlistId;
  if (typeof playlistId !== "string" || !playlistId) {
    return res.status(400).json({ error: "playlistId inválido" });
  }

  try {
    const { videoId, voterId } = req.body ?? {};
    return res.status(200).json(await toggleVote(playlistId, videoId, voterId));
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error:
        status === 400
          ? err.message
          : "Não foi possível salvar o voto. Conecte o Upstash Redis na Vercel.",
    });
  }
}
