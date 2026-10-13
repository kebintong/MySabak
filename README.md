# MySabak

[![CI/CD](https://github.com/kebintong/MySabak/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/kebintong/MySabak/actions/workflows/ci-cd.yml)

Ride booking web app for Cebu: no booking fees, no hidden charges.
Frontend design demo: plain HTML, CSS and JavaScript modules, no build step.

```
index.html          Ride screen: Ride | Express, map, Book → pay (Cash / GCash / Online banking, your price) → driver → Ride complete
pages/              support · drive · drive-signup · driver · shops · shop · checkout · order · merchant · merchant-home · account
assets/
  css/style.css     all styles
  js/config.js      settings: vehicles, fares, tips, parcel sizes, delivery rates
  js/api.js         every server call  ← backend replaces this file
  js/demo-data.js   demo-only data: the sample driver the Ride demo "finds" (delete when api.js is live)
  js/placeholders.js  plain pictures for shops and items that have no photo yet
  js/app.js         Ride screen      js/map.js   map, markers, route line
  js/ui.js          shared: top bar, tabs, toast, address search, tip sheet
  js/money.js       money maths      js/cart.js  shop cart
  js/menu.js        menu options: prices, rules, shop hours    js/shop-map.js  map + pins on Shop pages
  js/pages/         one script per page in pages/
  js/sw.js          offline cache
  fonts/  images/   map label font · logo, app icons, icons.svg
  dev/              demo hosting only (Cloudflare Worker + config); not part of the website
tests/              money rules, data layer, demo hosting, "no keys committed"
serve.py            local test server
PANELS.md           money rules, every panel, and the data shapes (backend contract)
```

## For the backend team

1. Read **[PANELS.md](PANELS.md)**: the money rules, every panel, the data it shows, and the shapes `api.js` must return.
2. Replace the function bodies in **`assets/js/api.js`** with calls to your API. Keep the names and return
   shapes; nothing else needs to change. Search it for `DEMO` to find what's still saved in the browser.
3. **`assets/dev/`** is only the demo's hosting (a Cloudflare Worker that forwards TomTom calls with a
   secret key). Replace it with your server, or delete it once your API is live.

## Demo accounts

| Side | Sign in at | Login | Password |
|---|---|---|---|
| Driver | Drive tab (`/pages/drive.html`) | `driver@mysabak.demo` or 0917 000 0001 | `mysabak-demo` |
| Merchant | Account → Merchant sign in (`/pages/merchant.html`) | `merchant@mysabak.demo` or 0917 000 0002 | `mysabak-demo` |

## Running it on your computer

Needs Python 3.

1. Create a file called `.dev.vars` next to `serve.py` (git ignores it) containing `TOMTOM_KEY=your-key`.
2. `python serve.py`, then open <http://localhost:8000>. Add `--lan` to open it from your phone.

Before pushing: `node --test "tests/*.test.mjs"` runs the same tests as CI (needs Node.js 22+).

## Deploying (demo site on Cloudflare)

Every push to `main` that passes the checks deploys automatically (GitHub Actions). CI copies
`index.html`, `pages/` and `assets/` (without `assets/dev/`) into `dist/` and deploys it with
`assets/dev/wrangler.jsonc`.

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
