import type { PlaylistMeta } from "./types";

export const PLAYLISTS: PlaylistMeta[] = [
  {
    id: "banda-2",
    dataFile: "/data/banda-2.json",
    tabLabel: "Banda 2",
    heading: "Ritmos diferentes | World Music | Estrangeiro",
    notes: [
      "É possível votar em mais de uma. (Não se esqueça de votar em suas proprias músicas)",
      "Música mais popular não é igual a música que será escolhida",
    ],
    playlistUrl:
      "https://music.youtube.com/playlist?list=PLTw6uHoXGtqw&si=tGe6fZCfGcMZmCEy",
    youtubePlaylistId: "PLTw6uHoXGtqw",
  },
  {
    id: "banda-3",
    dataFile: "/data/banda-3.json",
    tabLabel: "Banda 3",
    heading: "Soul | R&B | Funk | Alpha FM",
    notes: [
      "É possível votar em mais de uma. (Não se esqueça de votar em suas proprias músicas)",
      "Música mais popular não é igual a música que será escolhida",
    ],
    playlistUrl: "https://music.youtube.com/playlist?list=PLUCIptOsJlKM",
    youtubePlaylistId: "PLUCIptOsJlKM",
  },
];

export function spotifySearchUrl(artist: string, title: string) {
  const q = `${artist} ${title}`.trim();
  return `https://open.spotify.com/search/${encodeURIComponent(q)}`;
}

export function youtubeMusicUrl(videoId: string) {
  return `https://music.youtube.com/watch?v=${videoId}`;
}
