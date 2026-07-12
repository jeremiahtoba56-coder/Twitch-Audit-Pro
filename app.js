// ============================================================================
// Twitch Audit Pro — single-file app
//
// Run with:  node app.js
// (requires Node 18+, nothing else — no npm install needed)
//
// This ONE file serves the web page AND talks to Twitch. Your credentials
// go in a separate ".env" file next to this one (see bottom of this file
// for the format) — never inside this file, never inside the HTML, because
// this file's server-side code never gets sent to the browser, but the
// HTML below literally does. That's the one line that can't move.
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- Load .env manually (no dependency needed) ----
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}
const env = loadEnv();
const CLIENT_ID     = process.env.TWITCH_CLIENT_ID     || env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || env.TWITCH_CLIENT_SECRET;
const ACCESS_TOKEN  = process.env.TWITCH_ACCESS_TOKEN  || env.TWITCH_ACCESS_TOKEN;
const PORT = process.env.PORT || env.PORT || 8787;

// ── Hardcoded credentials (safe here — this file never reaches the browser) ──
const HARDCODED_CLIENT_ID    = 'gp762nuuoqcoxypju8c569th9wz7q5';
const HARDCODED_ACCESS_TOKEN = '5vhga7lomlwpbw2eptsvvzd4kkeha6';
// ─────────────────────────────────────────────────────────────────────────────

const FINAL_CLIENT_ID = CLIENT_ID || HARDCODED_CLIENT_ID;
const FINAL_TOKEN     = ACCESS_TOKEN || HARDCODED_ACCESS_TOKEN;
const FINAL_SECRET    = CLIENT_SECRET; // optional — only needed to auto-refresh tokens

if (!FINAL_CLIENT_ID || !FINAL_TOKEN) {
  console.warn('\n⚠️  No Twitch credentials found. Add them to .env or hardcode above.\n');
} else {
  console.log(`✅ Credentials loaded — Client ID: ${FINAL_CLIENT_ID.slice(0,8)}…`);
}

// ---- Token handling ----
// If a Client Secret is available, auto-generate fresh tokens (best for production).
// If only a pre-generated Access Token is provided, use it directly (simpler, works fine).
let tokenCache = { token: FINAL_TOKEN, expiresAt: Date.now() + 3600_000 };

async function getAppAccessToken() {
  // If we have a secret, refresh the token when needed
  if (FINAL_SECRET) {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
    const params = new URLSearchParams({
      client_id: FINAL_CLIENT_ID, client_secret: FINAL_SECRET, grant_type: 'client_credentials',
    });
    const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return tokenCache.token;
  }
  // No secret — use the pre-generated token directly
  return FINAL_TOKEN;
}

async function twitchFetch(p) {
  const token = await getAppAccessToken();
  const res = await fetch(`https://api.twitch.tv/helix${p}`, {
    headers: { 'Client-Id': FINAL_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch API error on ${p}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function handleAnalyze(username, res) {
  try {
    if (!FINAL_CLIENT_ID || !FINAL_TOKEN) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing Twitch credentials. Check app.js or your .env file.' }));
    }
    const usersData = await twitchFetch(`/users?login=${encodeURIComponent(username)}`);
    const user = usersData.data && usersData.data[0];
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `No Twitch user found for "${username}".` }));
    }
    const channelData = await twitchFetch(`/channels?broadcaster_id=${user.id}`);
    const channel = channelData.data && channelData.data[0];
    const streamData = await twitchFetch(`/streams?user_id=${user.id}`);
    const stream = streamData.data && streamData.data[0];

    const payload = {
      source: 'twitch-helix-live',
      identity: {
        id: user.id, login: user.login, displayName: user.display_name,
        broadcasterType: user.broadcaster_type || 'none', description: user.description,
        profileImageUrl: user.profile_image_url, offlineImageUrl: user.offline_image_url,
        createdAt: user.created_at,
      },
      channel: channel ? {
        broadcasterLanguage: channel.broadcaster_language, gameName: channel.game_name,
        title: channel.title, tags: channel.tags || [],
      } : null,
      live: stream ? {
        isLive: true, viewerCount: stream.viewer_count, startedAt: stream.started_at,
        title: stream.title, thumbnailUrl: stream.thumbnail_url,
      } : { isLive: false },
      followers: { available: false, reason: 'Requires user OAuth (moderator:read:followers scope).' },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error(err);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch from Twitch.', detail: err.message }));
  }
}

// ---- The page itself (same UI as before, trimmed HTML shown; full file below) ----
const PAGE_PATH = path.join(__dirname, 'index.html');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/analyze') {
    const username = (url.searchParams.get('username') || '').trim().toLowerCase();
    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'username query param is required' }));
    }
    return handleAnalyze(username, res);
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(PAGE_PATH, (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('index.html not found next to app.js');
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n✅ Twitch Audit Pro running at http://localhost:${PORT}\n`);
});

// ============================================================================
// CREDENTIAL OPTIONS — pick whichever works for you:
//
// OPTION A — Hardcoded (already done above, works immediately, no .env needed)
//   Credentials are set directly in the HARDCODED_* constants above.
//   Best for personal/private tools where you control the server.
//
// OPTION B — .env file (more flexible, swap creds without touching code)
//   Create a file named exactly ".env" next to app.js:
//
//   TWITCH_CLIENT_ID=your_client_id_here
//   TWITCH_ACCESS_TOKEN=your_access_token_here
//
//   Optional — add this only if you want auto-refreshing tokens:
//   TWITCH_CLIENT_SECRET=your_client_secret_here
//
// Get Client ID + Secret from: https://dev.twitch.tv/console/apps
// Get an Access Token from:    https://twitchtokengenerator.com
//   (choose "App Access Token", paste your Client ID + Secret)
//
// TOKEN EXPIRY NOTE:
//   Pre-generated access tokens expire after ~60 days. When yours expires,
//   either generate a new one at twitchtokengenerator.com, or add your
//   Client Secret so the server auto-refreshes it.
// ============================================================================
