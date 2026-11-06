# banda-vote

App React (Vite) para votar nas músicas das playlists **Banda 2** e **Banda 3**.

- Tema escuro, capa do YouTube, badges YouTube/Spotify, botão de like
- Clique no coração = vota / tira o voto na hora
- Ordena por votos, depois A–Z
- Anti voto-duplo leve via `localStorage`
- Playlist em cache (Redis) com revalidação em background no YouTube

## Rodar local

```bash
cd /Projects/banda-vote
npm install
npm run dev
```

Abra http://127.0.0.1:4317  
Localmente os votos ficam em `.data/votes.json`.

Para sincronizar com o YouTube localmente, exporte a chave:

```bash
export YOUTUBE_API_KEY=sua_chave
npm run dev
```

Sem a chave, a app usa o snapshot em `public/data/*.json` (e o cache local em `.data/playlist-cache.json` se já existir).

## Publicar na Vercel + Upstash (banco leve, grátis)

Na Vercel o disco some a cada deploy, então os votos e o cache da playlist precisam do Redis.

```bash
cd /Projects/banda-vote
npx vercel
```

1. Faça login quando pedir (GitHub / email).
2. Aceite as opções padrão (projeto na pasta atual).
3. No [dashboard da Vercel](https://vercel.com/dashboard), abra o projeto → **Storage** → **Create Database** → **Upstash Redis** → create e **Connect** ao projeto.
4. Em **Settings → Environment Variables**, adicione `YOUTUBE_API_KEY` (YouTube Data API v3).
5. Publique de novo para pegar as variáveis:

```bash
npx vercel --prod
```

A Vercel injeta `KV_REST_API_URL` e `KV_REST_API_TOKEN` (também aceita `UPSTASH_REDIS_REST_*`). Sem o Redis conectado, a página abre mas salvar votos falha.

Compartilhe o link `*.vercel.app` com a banda.

## Sync com YouTube

No load: a UI mostra o cache na hora e pede refresh em background (`GET /api/playlists/:id?refresh=1`).

Safety net: no máximo **1 fetch no YouTube por playlist a cada 3 minutos** (global, via Redis). Ajuste com `PLAYLIST_FETCH_MIN_MS` se quiser.

Como pegar a chave:

1. [Google Cloud Console](https://console.cloud.google.com/) → projeto
2. Ative **YouTube Data API v3**
3. **Credentials → API key**
4. Restrinja a chave à YouTube Data API v3

Os JSON em `public/data/*.json` continuam como fallback se a API/Redis falhar. Para regenerá-los manualmente:

```bash
uv run playlist-to-form "https://music.youtube.com/playlist?list=PLTw6uHoXGtqw"
uv run playlist-to-form "https://music.youtube.com/playlist?list=PLUCIptOsJlKM"
cp output/banda-2.json public/data/banda-2.json
cp output/banda-3.json public/data/banda-3.json
```
