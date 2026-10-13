# Deploying mysabak to Cloudflare

mysabak runs as one **Cloudflare Worker**:

- The app's files (`html/`, `css/`, `scripts/`, `assets/`, …) are served as static assets.
- `worker/index.js` forwards `/api/tomtom/*` to TomTom and adds the API key.
  The key is a Cloudflare **secret** (`TOMTOM_KEY`), so it is never in GitHub and never reaches the browser.
- `.assetsignore` keeps private files (`worker/`, `wrangler.jsonc`, `.git`, `serve.py`, …) off the website.

Free plan: 100,000 Worker requests a day (only `/api/*` counts; static files are free).

---

## 1. Get a new TomTom key

The old key was committed to GitHub, so treat it as public.

1. Go to <https://developer.tomtom.com> → **Dashboard** → **Keys**.
2. Create a new key (or regenerate the old one) and copy it.
3. Delete the old key `k1Vy…7zsBZ` once the new one works.
4. Do **not** turn on TomTom's domain whitelist for this key: the Cloudflare Worker sends no
   website address, so TomTom would refuse its requests.
5. Geoapify (no longer used): delete the key `8306…3764` in your Geoapify dashboard.

## 2. Deploy

### Option A: from GitHub (deploys again on every push)

1. Merge this branch into `main`.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository**.
3. Pick `kebintong/MySabak` and set:
   - Project name: `mysabak` (must match `"name"` in `wrangler.jsonc`)
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
4. **Save and Deploy**. The first deploy works, but the map shows an error until step 3 below.

### Option B: from your computer (needs Node.js 20+)

```sh
npx wrangler login
npx wrangler deploy
```

## 3. Add the key as a secret

Either:

- Dashboard → **Workers & Pages** → `mysabak` → **Settings** → **Variables and Secrets** → **Add**
  → Type **Secret**, Name `TOMTOM_KEY`, Value: your key → **Deploy**.

or:

```sh
npx wrangler secret put TOMTOM_KEY
```

Secrets stay when you deploy again; you only set it once.

Open `https://mysabak.<your-subdomain>.workers.dev`. You should see the map.

## 4. Optional: your own domain

1. Add `mysabak.com` to Cloudflare (Dashboard → **Add a domain**, then change the nameservers at your registrar).
2. Worker `mysabak` → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → `mysabak.com`.
3. Once the domain is on Cloudflare, add a rate limit so scripts can't drain your TomTom quota:
   **Security** → **WAF** → **Rate limiting rules** → path starts with `/api/` → e.g. 300 requests / 1 minute per IP → **Block**.

---

## Testing on your computer

1. Copy `.dev.vars.example` to `.dev.vars` and paste your key. Git ignores `.dev.vars`.
2. Either:
   - `python serve.py` → <http://localhost:8000/html/> (same proxy, Python only), or
   - `npx wrangler dev` → <http://localhost:8787/html/> (the real Cloudflare runtime).

## Settings

- `scripts/config.js`: public app settings (map look, start position, search area, fares). No keys.
- `TOMTOM_KEY`: Cloudflare secret (live site) or `.dev.vars` (your computer).
