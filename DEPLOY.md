# Deploying Twitch Audit Pro on Vercel

## What changed from the local version

The Express server is replaced with a **Vercel Serverless Function** at
`/api/analyze.js`. Same job (calls Twitch Helix using credentials that never
touch the browser), but it runs in Vercel's cloud instead of on your laptop,
so it works once deployed instead of only while `npm start` is running.

The frontend now calls a relative path (`/api/analyze?username=...`) instead
of `localhost:8787`, so the same file works locally and in production.

## 1. Push to GitHub

```
git init
git add .
git commit -m "Twitch Audit Pro prototype"
```

Create a new repo on GitHub, then:

```
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

**Before you push:** double check `.env` and `.env.local` are NOT in what
you're committing. Run `git status` — you should not see either file listed.
The included `.gitignore` already excludes them, but it's worth a glance.

## 2. Import into Vercel

1. Go to https://vercel.com/new
2. Import the GitHub repo you just pushed
3. Framework preset: choose "Other" (it's static HTML + a serverless
   function, not Next.js) — Vercel will detect the `/api` folder automatically
4. Click **Deploy** — it will succeed, but API calls will fail until step 3

## 3. Add your real credentials (in Vercel, not in code)

1. In your Vercel project, go to **Settings -> Environment Variables**
2. Add two variables:
   - `TWITCH_CLIENT_ID` = your real Client ID
   - `TWITCH_CLIENT_SECRET` = your real Client Secret
   (from https://dev.twitch.tv/console/apps)
3. Save, then go to **Deployments** and **redeploy** (env var changes need a
   redeploy to take effect)

That's it — your live URL (e.g. `your-project.vercel.app`) now has real
Twitch data flowing through the Analyze flow, and the credentials exist only
inside Vercel's encrypted environment variable store. They are never in your
GitHub repo, never in the HTML, never visible to site visitors.

## Testing locally before you push (optional)

```
npm install -g vercel
cp .env.example .env.local
# fill in .env.local with your real credentials
vercel dev
```

This runs the same serverless function locally at `http://localhost:3000`.
`.env.local` is gitignored, so it's safe to keep filled in on your machine.

## A note on rotating credentials

If your Client Secret is ever pasted into a chat, screenshot, or public
repo, treat it as compromised and regenerate it at
https://dev.twitch.tv/console/apps — regenerating the secret doesn't change
your Client ID, so nothing else needs to be updated.
