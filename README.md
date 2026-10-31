# MySabak

[![CI/CD](https://github.com/kebintong/MySabak/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/kebintong/MySabak/actions/workflows/ci-cd.yml)

Ride booking web app for Cebu: no booking fees, no hidden charges.
Frontend design demo: plain HTML, CSS and JavaScript modules, nothing to compile.

```
index.html          Home (Figma "Home v3") → Ride screen (#ride): Ride | Parcel, map, Book → pay (Cash / GCash / Online banking, your price) → driver → Ride complete
pages/              trips · wallet · account · shops · shop · checkout · order · support · drive · drive-signup · driver · merchant · merchant-home
manifest.webmanifest · sw.js   install details · offline cache
css/                base.css (shared) + one file per page that needs its own styles
js/
  config.js      settings: vehicles, fares, tips, parcel sizes, delivery rates
  api.js         every server call  ← backend replaces this file
  demo-data.js   demo-only data: the sample driver the Ride demo "finds" (delete when api.js is live)
  placeholders.js  plain pictures for shops and items that have no photo yet
  app.js         Ride screen      map.js   map, markers, route line
  ui.js          shared: top bar, tabs, toast, address search, tip sheet
  money.js       money maths      cart.js  shop cart
  menu.js        menu options: prices, rules, shop hours    shop-map.js  map + pins on Shop pages
  pages/         one script per page in pages/
assets/             map label font (fonts/) · logo, app icons, icons.svg, v3/ Figma illustrations (images/)
dev/                demo hosting only (Cloudflare Worker, config, build.mjs); not part of the website
tests/              money rules, data layer, demo hosting, "no keys committed"
PANELS.md           money rules, every panel, and the data shapes (backend contract)
```

## For the backend team

1. Read **[PANELS.md](PANELS.md)**: the money rules, every panel, the data it shows, and the shapes `api.js` must return.
2. Replace the function bodies in **`js/api.js`** with calls to your API. Keep the names and return
   shapes; nothing else needs to change. Search it for `DEMO` to find what's still saved in the browser.
3. **`dev/`** is only the demo's hosting (a Cloudflare Worker that forwards TomTom calls with a
   secret key). Replace it with your server, or delete it once your API is live.

## Demo accounts

| Side | Sign in at | Login | Password |
|---|---|---|---|
| Customer | Account → Customer (`/pages/account.html`) | `client@mysabak.demo` or 0917 000 0003 | `mysabak-demo` |
| Driver | Drive tab (`/pages/drive.html`) | `driver@mysabak.demo` or 0917 000 0001 | `mysabak-demo` |
| Merchant | Account → Merchant (`/pages/merchant.html`) | `merchant@mysabak.demo` or 0917 000 0002 | `mysabak-demo` |

## Claude Code

`.claude/settings.json` adds the [ponytail](https://github.com/DietrichGebert/ponytail) plugin marketplace and
enables its `ponytail` plugin ("lazy senior dev" mode: smallest change that works). Claude Code asks you to trust
it the first time you open this folder; `/plugin` shows it. Turn a level on or off with `/ponytail lite|full|ultra|off`.

## Running it on your computer

Needs Node.js 22+.

1. Create `dev/.dev.vars` (git ignores it) containing `TOMTOM_KEY=your-key`. Without it the site runs, but the map, search and routes won't load.
2. `npx wrangler@4.149.0 dev --config dev/wrangler.jsonc --port 8000`, then open <http://localhost:8000>. Add `--ip 0.0.0.0` to open it from your phone on the same Wi-Fi.

Before pushing: `node --test "tests/*.test.mjs"` runs the same tests as CI (needs Node.js 22+).

## Deploying (demo site on Cloudflare)

Every push to `main` that passes the checks deploys automatically (GitHub Actions). `dev/build.mjs` copies
the website into `dist/` and Wrangler deploys it with `dev/wrangler.jsonc`.

One-time setup:
1. **GitHub secrets** (repo → Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN`
   (Cloudflare → My Profile → API Tokens → template **Edit Cloudflare Workers**) and
   `CLOUDFLARE_ACCOUNT_ID` (Cloudflare → Workers & Pages → Account ID).
2. **TomTom key on the Worker**: Workers & Pages → `mysabak` → Settings → Variables and secrets → Add →
   Type **Secret**, Name `TOMTOM_KEY`. Don't turn on TomTom's domain whitelist for this key.

To re-deploy by hand: Actions → CI/CD → **Run workflow**.

### If the map or search doesn't work
Open **`/api/health`** on the live site. It tries every TomTom service the app uses and shows which ones
refuse the key, with TomTom's reason. A 401/403 line means that TomTom product isn't enabled for the key
(developer.tomtom.com → Keys): enable Maps / Map Display, Search, Places Search (Orbis) and Routing.
