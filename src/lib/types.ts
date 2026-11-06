export type Track = {
  index: number;
  title: string;
  artist: string;
  videoId: string;
  url: string;
};

export type PlaylistData = {
  title: string;
  url: string;
  tracks: Track[];
  source?: "cache" | "youtube" | "fallback" | string;
  updatedAt?: number | null;
  revalidated?: boolean;
  rateLimited?: boolean;
  refreshError?: string;
};

export type PlaylistMeta = {
  id: string;
  dataFile: string;
  tabLabel: string;
  heading: string;
  notes: string[];
  playlistUrl: string;
  youtubePlaylistId: string;
};

export type VotesResponse = {
  counts: Record<string, number>;
  mine: string[];
};
