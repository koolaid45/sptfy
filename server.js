require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
  PORT
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
  console.warn('WARNING: Missing one or more required env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN');
}

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 5000) {
    return cachedAccessToken;
  }
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

// simple in-memory lyrics cache keyed by artist+title
const lyricsCache = new Map();

async function fetchLyrics(artist, title, album, durationSec) {
  const key = `${artist}::${title}`;
  if (lyricsCache.has(key)) return lyricsCache.get(key);

  let result = null;

  // Try exact match first (artist + title + duration)
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
      album_name: album || '',
      duration: String(Math.round(durationSec))
    });
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      result = { synced: data.syncedLyrics || null, plain: data.plainLyrics || null };
    }
  } catch (e) {
    // fall through to search
  }

  // Fallback to fuzzy search
  if (!result) {
    try {
      const searchParams = new URLSearchParams({ artist_name: artist, track_name: title });
      const res = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`);
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr.length > 0) {
          const best = arr[0];
          result = { synced: best.syncedLyrics || null, plain: best.plainLyrics || null };
        }
      }
    } catch (e) {
      // give up
    }
  }

  if (!result) result = { synced: null, plain: null };
  lyricsCache.set(key, result);
  return result;
}

app.get('/api/now-playing', async (req, res) => {
  try {
    const token = await getAccessToken();
    const npRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (npRes.status === 204 || npRes.status === 202) {
      return res.json({ playing: false });
    }
    if (!npRes.ok) {
      const text = await npRes.text();
      return res.status(502).json({ error: 'spotify_error', detail: text });
    }

    const data = await npRes.json();
    if (!data || !data.item) {
      return res.json({ playing: false });
    }

    const track = data.item;
    const artist = track.artists.map((a) => a.name).join(', ');
    const title = track.name;
    const album = track.album ? track.album.name : '';
    const durationMs = track.duration_ms;
    const rawProgressMs = data.progress_ms;
    const isPlaying = data.is_playing;
    const albumArt =
      track.album && track.album.images && track.album.images[0]
        ? track.album.images[0].url
        : null;

    // rawProgressMs reflects playback position at the moment Spotify answered.
    // fetchLyrics() below can take a while on an uncached lookup (new track),
    // so we time it and add that gap back in before responding - otherwise
    // the position we hand the client is already stale by however long the
    // lyrics lookup took, which shows up as "offset lyrics" right after a
    // track change.
    const beforeLyricsFetch = Date.now();
    const lyrics = await fetchLyrics(artist, title, album, durationMs / 1000);
    const lyricsFetchDurationMs = Date.now() - beforeLyricsFetch;
    const progressMs = isPlaying ? rawProgressMs + lyricsFetchDurationMs : rawProgressMs;

    res.json({
      playing: true,
      isPlaying,
      artist,
      title,
      album,
      albumArt,
      durationMs,
      progressMs,
      serverTime: Date.now(),
      lyrics
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const port = PORT || 3000;
app.listen(port, () => console.log(`Now Playing server running on port ${port}`));
