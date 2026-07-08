// ------------------------------------------------------------------
// Twitch Audit Pro — local API server
//
// This is the ONLY place Twitch credentials are used. They are read
// from environment variables (via .env, which you create locally)
// and are never sent to the browser. The frontend only ever talks
// to this server, at /api/analyze/:username.
// ------------------------------------------------------------------

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn(
    '\n⚠️  TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set.\n' +
    '   Copy .env.example to .env and fill in your real values.\n' +
    '   The server will start, but /api/analyze calls will fail until then.\n'
  );
}

// ---- App access token cache (client-credentials flow) ----
// The server fetches its own short-lived app access token using the
// Client ID + Secret, and refreshes it automatically when it expires.
// No raw access token ever needs to be pasted in by hand.
let tokenCache = { token: null, expiresAt: 0 };

async function getAppAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
  });

  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params.toString()}`, {
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get Twitch app access token: ${res.status} ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

async function twitchFetch(path) {
  const token = await getAppAccessToken();
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: {
      'Client-Id': CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitch API error on ${path}: ${res.status} ${body}`);
  }
  return res.json();
}

// ---- Route: analyze a channel ----
app.get('/api/analyze/:username', async (req, res) => {
  const username = req.params.username.trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Server is missing Twitch credentials. Fill in server/.env from .env.example.',
    });
  }

  try {
    // 1. Identity
    const usersData = await twitchFetch(`/users?login=${encodeURIComponent(username)}`);
    const user = usersData.data && usersData.data[0];
    if (!user) {
      return res.status(404).json({ error: `No Twitch user found for "${username}".` });
    }

    // 2. Channel info (category, title, language, tags)
    const channelData = await twitchFetch(`/channels?broadcaster_id=${user.id}`);
    const channel = channelData.data && channelData.data[0];

    // 3. Live status
    const streamData = await twitchFetch(`/streams?user_id=${user.id}`);
    const stream = streamData.data && streamData.data[0];

    // NOTE: Twitch's public follower count endpoint now requires a
    // USER access token with the moderator:read:followers scope —
    // an app access token (client-credentials, used above) cannot
    // read it. That's a Twitch API limitation, not a bug here. In a
    // production build this means adding a "Login with Twitch" (user
    // OAuth) flow so the streamer can authorize their own audit.
    const followerInfo = {
      available: false,
      reason: 'Follower count requires user OAuth (moderator:read:followers scope), not app-only auth.',
    };

    res.json({
      source: 'twitch-helix-live',
      identity: {
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        broadcasterType: user.broadcaster_type || 'none', // "partner", "affiliate", or "none"
        description: user.description,
        profileImageUrl: user.profile_image_url,
        offlineImageUrl: user.offline_image_url,
        createdAt: user.created_at,
      },
      channel: channel ? {
        broadcasterLanguage: channel.broadcaster_language,
        gameName: channel.game_name,
        title: channel.title,
        tags: channel.tags || [],
      } : null,
      live: stream ? {
        isLive: true,
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
        title: stream.title,
        thumbnailUrl: stream.thumbnail_url,
      } : { isLive: false },
      followers: followerInfo,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch data from Twitch.', detail: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasCredentials: Boolean(CLIENT_ID && CLIENT_SECRET) });
});

app.listen(PORT, () => {
  console.log(`\n✅ Twitch Audit Pro API running at http://localhost:${PORT}`);
  console.log(`   Try: http://localhost:${PORT}/api/analyze/shroud\n`);
});
