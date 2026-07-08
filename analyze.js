// ------------------------------------------------------------------
// Vercel Serverless Function: /api/analyze
//
// This runs in Vercel's cloud, not the browser. Credentials come from
// Vercel's own Environment Variables (Project Settings -> Environment
// Variables) — never from a file in this repo, and never from the
// frontend. This file must NEVER contain real credential values.
//
// Local testing: `vercel dev` reads a ".env.local" file (gitignored)
// with the same two variables. That file never gets pushed to GitHub.
// ------------------------------------------------------------------

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Serverless functions can cold-start, so this in-memory cache only
// helps within a warm instance — that's fine, token requests are cheap.
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
    throw new Error(`Failed to get Twitch app access token: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function twitchFetch(path) {
  const token = await getAppAccessToken();
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: { 'Client-Id': CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Twitch API error on ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

module.exports = async (req, res) => {
  // Basic CORS so the static HTML (served from the same Vercel project)
  // can call this. Since it's same-origin in production you could drop
  // this, but it keeps local testing flexible too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const username = String(req.query.username || '').trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET. Set them in Vercel Project Settings -> Environment Variables, then redeploy.',
    });
  }

  try {
    const usersData = await twitchFetch(`/users?login=${encodeURIComponent(username)}`);
    const user = usersData.data && usersData.data[0];
    if (!user) {
      return res.status(404).json({ error: `No Twitch user found for "${username}".` });
    }

    const channelData = await twitchFetch(`/channels?broadcaster_id=${user.id}`);
    const channel = channelData.data && channelData.data[0];

    const streamData = await twitchFetch(`/streams?user_id=${user.id}`);
    const stream = streamData.data && streamData.data[0];

    res.status(200).json({
      source: 'twitch-helix-live',
      identity: {
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        broadcasterType: user.broadcaster_type || 'none',
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
      followers: {
        available: false,
        reason: 'Requires user OAuth (moderator:read:followers scope), not app-only auth.',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to fetch data from Twitch.', detail: err.message });
  }
};
