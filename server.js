require('dotenv').config();
const express = require('express');
const path = require('path');
const Vibrant = require('node-vibrant');

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
    // fetchLyrics()/extractPalette() below can take a while on an uncached
    // lookup (new track), so we time the combined work and add that gap back
    // in before responding - otherwise the position we hand the client is
    // already stale, which shows up as "offset lyrics" right after a track
    // change.
    const beforeProcessing = Date.now();
    const [lyrics, palette] = await Promise.all([
      fetchLyrics(artist, title, album, durationMs / 1000),
      extractPalette(albumArt)
    ]);
    const processingDurationMs = Date.now() - beforeProcessing;
    const progressMs = isPlaying ? rawProgressMs + processingDurationMs : rawProgressMs;

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
      lyrics,
      palette
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', detail: String(err) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const port = PORT || 3000;
app.listen(port, () => console.log(`Now Playing server running on port ${port}`));
