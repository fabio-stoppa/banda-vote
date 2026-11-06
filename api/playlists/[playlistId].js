import { getPlaylist, refreshPlaylist } from "../../server/playlists.js";

export default async function handler(req, res) {
  const playlistId = req.query.playlistId;
  if (typeof playlistId !== "string" || !playlistId) {
    return res.status(400).json({ error: "playlistId inválido" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const refresh =
      req.query.refresh === "1" ||
      req.query.refresh === "true" ||
      req.query.revalidate === "1";

    const data = refresh ? await refreshPlaylist(playlistId) : await getPlaylist(playlistId);
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error:
        status === 400 || status === 404
          ? err.message
          : "Não foi possível carregar a playlist.",
    });
  }
}
