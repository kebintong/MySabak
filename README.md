# MySabak

[![CI/CD](https://github.com/kebintong/MySabak/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/kebintong/MySabak/actions/workflows/ci-cd.yml)

Ride booking web app for Cebu: no booking fees, no hidden charges.
Plain HTML, CSS and JavaScript (no build step), hosted on a Cloudflare Worker.

```
public/     the website (everything here is served as-is)
worker/     Cloudflare Worker: serves public/ and forwards /api/tomtom/* to TomTom with the key
.github/    CI/CD: checks every pull request, deploys main to Cloudflare
wrangler.jsonc   Cloudflare settings
PLAN.md          map roadmap
```

App settings (map look, start position, fares) are in `public/scripts/config.js`.
The TomTom key is **not** in this repo: it's a secret on the Cloudflare Worker.

## Deploying

Every push to `main` that passes the checks deploys to Cloudflare (GitHub Actions).

One-time setup:

1. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN`: Cloudflare → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**.
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare → Workers & Pages → Account ID.
2. **TomTom key on the Worker** (Cloudflare, not GitHub):
   Workers & Pages → `mysabak` → Settings → Variables and secrets → **Add** →
   Type **Secret**, Name `TOMTOM_KEY`, Value: your key from <https://developer.tomtom.com> → **Deploy**.
   It stays across deploys. Don't turn on TomTom's domain whitelist for this key: the Worker sends no
   website address, so TomTom would refuse it.
3. Turn off GitHub Pages (repo → Settings → Pages → Source: **None**). The app needs the Worker,
   so a GitHub Pages copy can't load the map.

To re-deploy by hand: Actions → CI/CD → **Run workflow**.

Optional: once `mysabak.com` is on Cloudflare, add it under the Worker's Settings → Domains & Routes,
and add a rate-limiting rule on `/api/*` (Security → WAF) so scripts can't use up the TomTom quota.

## Running it on your computer

Needs Node.js 22+.

1. Create a file called `.dev.vars` (git ignores it) containing `TOMTOM_KEY=your-key`.
2. `npx wrangler dev`, then open <http://localhost:8787>.
3. Before pushing: `node --test "worker/*.test.mjs"` runs the same tests as CI.
