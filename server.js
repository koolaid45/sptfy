require('dotenv').config();
const express = require('express');
const path = require('path');

// node-vibrant powers album-art palette extraction. It's a nice-to-have,
// not core to showing the track, so a missing/broken install degrades to
// "no palette" rather than taking down the whole server.
let Vibrant = null;
try {
  Vibrant = require('node-vibrant');
} catch (err) {
  console.warn(
    'node-vibrant not available - palette extraction disabled. ' +
    'Run `npm install` to enable it. Reason:',
    err.message
  );
}

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

// Standard CSS extended color names, used to label extracted swatches
// with a human-readable name rather than just a hex code.
const NAMED_COLORS = [
  ['Black', '#000000'], ['Charcoal', '#1C1C1C'], ['Dim Gray', '#696969'],
  ['Gray', '#808080'], ['Dark Gray', '#A9A9A9'], ['Silver', '#C0C0C0'],
  ['Light Gray', '#D3D3D3'], ['Gainsboro', '#DCDCDC'], ['White Smoke', '#F5F5F5'],
  ['White', '#FFFFFF'], ['Ivory', '#FFFFF0'], ['Snow', '#FFFAFA'],
  ['Maroon', '#800000'], ['Dark Red', '#8B0000'], ['Firebrick', '#B22222'],
  ['Red', '#FF0000'], ['Crimson', '#DC143C'], ['Tomato', '#FF6347'],
  ['Coral', '#FF7F50'], ['Salmon', '#FA8072'], ['Light Salmon', '#FFA07A'],
  ['Dark Salmon', '#E9967A'], ['Indian Red', '#CD5C5C'], ['Rosy Brown', '#BC8F8F'],
  ['Sienna', '#A0522D'], ['Saddle Brown', '#8B4513'], ['Chocolate', '#D2691E'],
  ['Peru', '#CD853F'], ['Sandy Brown', '#F4A460'], ['Burlywood', '#DEB887'],
  ['Tan', '#D2B48C'], ['Wheat', '#F5DEB3'], ['Navajo White', '#FFDEAD'],
  ['Bisque', '#FFE4C4'], ['Blanched Almond', '#FFEBCD'], ['Peach Puff', '#FFDAB9'],
  ['Moccasin', '#FFE4B5'], ['Orange', '#FFA500'], ['Dark Orange', '#FF8C00'],
  ['Orange Red', '#FF4500'], ['Gold', '#FFD700'], ['Goldenrod', '#DAA520'],
  ['Dark Goldenrod', '#B8860B'], ['Khaki', '#F0E68C'], ['Dark Khaki', '#BDB76B'],
  ['Olive', '#808000'], ['Yellow', '#FFFF00'], ['Yellow Green', '#9ACD32'],
  ['Dark Olive Green', '#556B2F'], ['Olive Drab', '#6B8E23'], ['Lawn Green', '#7CFC00'],
  ['Chartreuse', '#7FFF00'], ['Green Yellow', '#ADFF2F'], ['Dark Green', '#006400'],
  ['Green', '#008000'], ['Forest Green', '#228B22'], ['Lime', '#00FF00'],
  ['Lime Green', '#32CD32'], ['Light Green', '#90EE90'], ['Pale Green', '#98FB98'],
  ['Dark Sea Green', '#8FBC8F'], ['Medium Spring Green', '#00FA9A'], ['Spring Green', '#00FF7F'],
  ['Sea Green', '#2E8B57'], ['Medium Aquamarine', '#66CDAA'], ['Medium Sea Green', '#3CB371'],
  ['Light Sea Green', '#20B2AA'], ['Dark Slate Gray', '#2F4F4F'], ['Teal', '#008080'],
  ['Dark Cyan', '#008B8B'], ['Aqua', '#00FFFF'], ['Cyan', '#00FFFF'],
  ['Light Cyan', '#E0FFFF'], ['Dark Turquoise', '#00CED1'], ['Turquoise', '#40E0D0'],
  ['Medium Turquoise', '#48D1CC'], ['Pale Turquoise', '#AFEEEE'], ['Aquamarine', '#7FFFD4'],
  ['Powder Blue', '#B0E0E6'], ['Cadet Blue', '#5F9EA0'], ['Steel Blue', '#4682B4'],
  ['Corn Flower Blue', '#6495ED'], ['Deep Sky Blue', '#00BFFF'], ['Dodger Blue', '#1E90FF'],
  ['Light Blue', '#ADD8E6'], ['Sky Blue', '#87CEEB'], ['Light Sky Blue', '#87CEFA'],
  ['Midnight Blue', '#191970'], ['Navy', '#000080'], ['Dark Blue', '#00008B'],
  ['Medium Blue', '#0000CD'], ['Blue', '#0000FF'], ['Royal Blue', '#4169E1'],
  ['Blue Violet', '#8A2BE2'], ['Indigo', '#4B0082'], ['Dark Slate Blue', '#483D8B'],
  ['Slate Blue', '#6A5ACD'], ['Medium Slate Blue', '#7B68EE'], ['Medium Purple', '#9370DB'],
  ['Dark Magenta', '#8B008B'], ['Dark Violet', '#9400D3'], ['Dark Orchid', '#9932CC'],
  ['Medium Orchid', '#BA55D3'], ['Purple', '#800080'], ['Thistle', '#D8BFD8'],
  ['Plum', '#DDA0DD'], ['Violet', '#EE82EE'], ['Magenta', '#FF00FF'],
  ['Orchid', '#DA70D6'], ['Medium Violet Red', '#C71585'], ['Pale Violet Red', '#DB7093'],
  ['Deep Pink', '#FF1493'], ['Hot Pink', '#FF69B4'], ['Light Pink', '#FFB6C1'],
  ['Pink', '#FFC0CB'], ['Antique White', '#FAEBD7'], ['Beige', '#F5F5DC'],
  ['Cornsilk', '#FFF8DC'], ['Lemon Chiffon', '#FFFACD'], ['Light Goldenrod', '#FAFAD2'],
  ['Light Yellow', '#FFFFE0'], ['Amber', '#FFBF00'], ['Rust', '#B7410E'],
  ['Copper', '#B87333'], ['Brass', '#B5A642'], ['Slate Gray', '#708090'],
  ['Light Slate Gray', '#778899'], ['Rebecca Purple', '#663399'], ['Mint Cream', '#F5FFFA'],
  ['Honeydew', '#F0FFF0'], ['Azure', '#F0FFFF'], ['Alice Blue', '#F0F8FF'],
  ['Ghost White', '#F8F8FF'], ['Seashell', '#FFF5EE'], ['Old Lace', '#FDF5E6'],
  ['Linen', '#FAF0E6'], ['Misty Rose', '#FFE4E1'], ['Lavender', '#E6E6FA'],
  ['Lavender Blush', '#FFF0F5']
];

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function nearestColorName(hex) {
  const target = hexToRgb(hex);
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < NAMED_COLORS.length; i++) {
    const rgb = hexToRgb(NAMED_COLORS[i][1]);
    const dist =
      Math.pow(rgb.r - target.r, 2) +
      Math.pow(rgb.g - target.g, 2) +
      Math.pow(rgb.b - target.b, 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = NAMED_COLORS[i][0];
    }
  }
  return best || 'Unknown';
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function darken(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r * factor)}${toHex(g * factor)}${toHex(b * factor)}`;
}

// Cache palettes by album art URL (same art -> same palette, regardless of track)
const paletteCache = new Map();

async function extractPalette(albumArtUrl) {
  if (!Vibrant) return null;
  if (!albumArtUrl) return null;
  if (paletteCache.has(albumArtUrl)) return paletteCache.get(albumArtUrl);

  try {
    const rawPalette = await Vibrant.from(albumArtUrl).getPalette();
    const roleOrder = ['Vibrant', 'LightVibrant', 'DarkVibrant', 'Muted', 'LightMuted', 'DarkMuted'];
    const roleLabels = {
      Vibrant: 'Vibrant',
      LightVibrant: 'Light Vibrant',
      DarkVibrant: 'Dark Vibrant',
      Muted: 'Muted',
      LightMuted: 'Light Muted',
      DarkMuted: 'Dark Muted'
    };

    const swatches = [];
    roleOrder.forEach((role) => {
      const sw = rawPalette[role];
      if (sw) {
        const hex = sw.getHex();
        swatches.push({
          role: roleLabels[role],
          hex,
          name: nearestColorName(hex)
        });
      }
    });

    if (swatches.length === 0) {
      paletteCache.set(albumArtUrl, null);
      return null;
    }

    // Pick theme roles: a dark background, a slightly lighter panel tone,
    // and a bright accent. Force the background dark enough for our fixed
    // light text to stay legible even on palettes with no natural dark swatch.
    const darkCandidate =
      swatches.find((s) => s.role === 'Dark Muted') ||
      swatches.find((s) => s.role === 'Dark Vibrant') ||
      swatches[0];
    const accentCandidate =
      swatches.find((s) => s.role === 'Vibrant') ||
      swatches.find((s) => s.role === 'Light Vibrant') ||
      swatches[0];

    let voidHex = darkCandidate.hex;
    if (relativeLuminance(voidHex) > 0.22) {
      voidHex = darken(voidHex, 0.35);
    }
    // Panel tone: void color lightened slightly, for subtle contrast between
    // the page background and each quadrant's panel.
    const panelHexFinal = (() => {
      const { r, g, b } = hexToRgb(voidHex);
      const lighten = (v) => Math.min(255, Math.round(v + 18));
      const toHex = (v) => lighten(v).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    })();

    const result = {
      swatches,
      theme: {
        accent: accentCandidate.hex,
        void: voidHex,
        panel: panelHexFinal
      }
    };
    paletteCache.set(albumArtUrl, result);
    return result;
  } catch (err) {
    console.error('Palette extraction failed:', err);
    paletteCache.set(albumArtUrl, null);
    return null;
  }
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

// Fetch with one automatic retry on 401 using a freshly minted token.
// A cached access token can expire between our check and Spotify's read,
// which would otherwise surface as a hard failure.
async function spotifyFetch(url) {
  let token = await getAccessToken();
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    token = await getAccessToken();
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}

// ---------------------------------------------------------------------------
// Shared now-playing snapshot.
//
// Clients must never trigger Spotify calls directly: several devices/tabs
// polling at once would multiply request volume and trip Spotify's rate
// limit (429 QUOTA_EXCEEDED). Instead the server refreshes one snapshot on
// a fixed minimum interval and every client reads that same cached copy.
// ---------------------------------------------------------------------------
const MIN_REFRESH_MS = 5000;       // never call Spotify more often than this
const MAX_BACKOFF_MS = 5 * 60000;  // ceiling when repeatedly rate limited

let snapshot = { playing: false, reason: 'starting_up' };
let snapshotTakenAt = 0;
let refreshInFlight = null;
let backoffUntil = 0;
let consecutiveRateLimits = 0;

async function buildSnapshot() {
  // additional_types=episode so podcasts don't come back as an empty
  // item and look identical to "nothing playing".
  const npUrl =
    'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode';
  const npRes = await spotifyFetch(npUrl);

  if (npRes.status === 429) {
    // Honour Spotify's Retry-After (seconds). Back off hard - hammering
    // through a 429 is what extends the penalty window.
    const retryAfterSec = parseInt(npRes.headers.get('retry-after') || '0', 10);
    consecutiveRateLimits++;
    const waitMs = Math.min(
      Math.max(retryAfterSec * 1000, MIN_REFRESH_MS * Math.pow(2, consecutiveRateLimits)),
      MAX_BACKOFF_MS
    );
    backoffUntil = Date.now() + waitMs;
    console.warn(`Rate limited by Spotify. Backing off ${Math.round(waitMs / 1000)}s.`);
    return {
      playing: false,
      reason: 'rate_limited',
      retryInSec: Math.round(waitMs / 1000)
    };
  }

  consecutiveRateLimits = 0;
  let data = null;

  if (npRes.ok) {
    const text = await npRes.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = null; }
    }
  } else if (npRes.status !== 204 && npRes.status !== 202) {
    const text = await npRes.text();
    return {
      playing: false,
      reason: 'spotify_error',
      detail: text.slice(0, 300)
    };
  }

  // NOTE: the /me/player fallback that used to live here was removed - it
  // doubled request volume on every empty response, which contributed to
  // hitting the rate limit in the first place. A 204 is now simply treated
  // as "nothing playing"; the client tolerates brief gaps on its own.
  if (!data || !data.item) {
    return { playing: false, reason: 'nothing_playing' };
  }

  const track = data.item;
  const artist = Array.isArray(track.artists) && track.artists.length
    ? track.artists.map((a) => a.name).join(', ')
    : (track.show ? track.show.name : 'Unknown');
  const title = track.name;
  const album = track.album ? track.album.name : (track.show ? track.show.name : '');
  const durationMs = track.duration_ms;
  const rawProgressMs = data.progress_ms;
  const isPlaying = data.is_playing;
  const images = (track.album && track.album.images) ||
                 (track.show && track.show.images) || [];
  const albumArt = images.length ? images[0].url : null;

  const beforeProcessing = Date.now();
  const [lyrics, palette] = await Promise.all([
    fetchLyrics(artist, title, album, durationMs / 1000),
    extractPalette(albumArt)
  ]);
  const processingDurationMs = Date.now() - beforeProcessing;
  const progressMs = isPlaying ? rawProgressMs + processingDurationMs : rawProgressMs;

  return {
    playing: true,
    isPlaying,
    artist,
    title,
    album,
    albumArt,
    durationMs,
    progressMs,
    lyrics,
    palette
  };
}

async function getSnapshot() {
  const now = Date.now();

  // Serving stale data during a backoff is far better than compounding a
  // rate limit with more requests.
  if (now < backoffUntil) return snapshot;

  // Fresh enough - reuse.
  if (now - snapshotTakenAt < MIN_REFRESH_MS) return snapshot;

  // Collapse concurrent requests onto a single in-flight refresh, so ten
  // clients arriving together still produce exactly one Spotify call.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const next = await buildSnapshot();
      snapshot = next;
      snapshotTakenAt = Date.now();
    } catch (err) {
      console.error('Snapshot refresh failed:', err);
      snapshot = {
        playing: false,
        reason: 'server_error',
        detail: String(err).slice(0, 300)
      };
      snapshotTakenAt = Date.now();
    } finally {
      refreshInFlight = null;
    }
    return snapshot;
  })();

  return refreshInFlight;
}

app.get('/api/now-playing', async (req, res) => {
  try {
    const snap = await getSnapshot();
    const ageMs = Date.now() - snapshotTakenAt;

    // Advance the reported position by the snapshot's age so cached data
    // doesn't make playback appear to lag behind.
    const payload = Object.assign({}, snap, { serverTime: Date.now() });
    if (snap.playing && snap.isPlaying && typeof snap.progressMs === 'number') {
      let adjusted = snap.progressMs + ageMs;
      if (snap.durationMs && adjusted > snap.durationMs) adjusted = snap.durationMs;
      payload.progressMs = adjusted;
    }

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      playing: false,
      reason: 'server_error',
      detail: String(err).slice(0, 300)
    });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const port = PORT || 3000;
app.listen(port, () => console.log(`Now Playing server running on port ${port}`));
