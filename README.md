# Twitch Audit Pro — local test server

This is a minimal local server so you can test real Twitch data flowing into
the prototype UI. Your credentials never leave your machine and are never
written into any file that gets shared, committed, or handed back in chat.

## Setup (one time)

1. Open a terminal in this `server/` folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the environment template:
   ```
   cp .env.example .env
   ```
4. Open `.env` in a text editor and fill in your real values from
   https://dev.twitch.tv/console/apps :
   - `TWITCH_CLIENT_ID`
   - `TWITCH_CLIENT_SECRET` (click "New Secret" on your app's page if you
     don't have one — this is safer than a raw access token because the
     server generates and refreshes its own short-lived tokens automatically)
5. Save `.env`. **Never share this file or paste its contents anywhere.**

## Run it

```
npm start
```

You should see:
```
✅ Twitch Audit Pro API running at http://localhost:8787
```

Test it directly in your browser: `http://localhost:8787/api/analyze/shroud`

## Using it with the frontend

Open `twitch-audit-pro.html` in your browser while this server is running.
The Analyze button will now call your local server first. If the server
isn't running (or credentials aren't set), it automatically falls back to
the demo/mock data so the UI never breaks — you'll see a small badge in the
report indicating which mode was used ("Live Twitch Data" vs "Demo Data").

## What's real vs. what's still mocked

**Real (pulled live from Twitch Helix):**
- Display name, avatar, description/bio
- Partner / Affiliate / none status
- Current category, title, tags
- Live status, viewer count

**Not available with this auth method:**
- Follower count. Twitch now requires a *user* OAuth token with the
  `moderator:read:followers` scope to read this — an app-only token
  (what this server uses) cannot fetch it. A production build would add
  a real "Login with Twitch" flow so streamers authorize their own audit.

**Still mocked (this is the actual analysis engine from Part 5 of the
spec, which hasn't been built yet):**
- Health score, brand score, community score, growth score
- Quick wins, AI Coach messages
- Panel detection, image quality scoring, color extraction

Those need the analyzer/rule/scoring engine — a much bigger build than
wiring up read-only profile data. This step was about proving the Twitch
connection works end-to-end safely; the scoring engine is the next phase.
