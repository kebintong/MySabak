/* =========================================================
   mysabak · Cloudflare Worker
   - Serves the app's files (the "assets" in wrangler.jsonc).
   - Forwards /api/tomtom/* to api.tomtom.com with the API key added.
     The key is a Cloudflare secret (TOMTOM_KEY), so it is never in GitHub
     or in the browser.
   - /api/health: tries each TomTom service the app uses and reports which ones
     accept the key (open it in a browser when the map or search fails).
   ========================================================= */
const TOMTOM = 'https://api.tomtom.com';
const PREFIX = '/api/tomtom';

// Only the TomTom APIs the app uses
const ALLOWED_PATHS = [
  /^\/maps\/orbis\//,                       // map style, tiles, icons, fonts, Places Search
  /^\/search\/2\/(search|reverseGeocode)\//, // classic search, street + barangay
  /^\/routing\/1\/calculateRoute\//,         // routes
];

// Request headers the TomTom APIs need (everything else, like cookies, stays here)
const FORWARD_HEADERS = ['accept', 'accept-language', 'content-type', 'tomtom-api-version', 'attributes'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${PREFIX}/`)) return proxyTomTom(request, env, url);
    if (url.pathname === '/api/health') return health(env);
    return env.ASSETS.fetch(request);
  },
};

async function proxyTomTom(request, env, url) {
  if (!env.TOMTOM_KEY) return error(503, 'TOMTOM_KEY is not set. Add it as a secret in Cloudflare.');
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return error(405, 'Method not allowed.');
  if (fromOtherSite(request, url)) return error(403, 'Only mysabak can use this.');

  const path = url.pathname.slice(PREFIX.length);
  if (!ALLOWED_PATHS.some((re) => re.test(path))) return error(404, 'Not found.');

  const target = new URL(TOMTOM + path + url.search);
  target.searchParams.set('key', env.TOMTOM_KEY);
  const headers = new Headers();
  FORWARD_HEADERS.forEach((h) => {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  });
  // Places Search reads the key from this header; everything else (maps, search, routing) uses ?key= only,
  // the same way TomTom's own SDK calls them.
  if (path.startsWith('/maps/orbis/places/')) headers.set('TomTom-Api-Key', env.TOMTOM_KEY);

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? request.body : undefined,
  });

  // TomTom can echo the key back (e.g. inside the map style's tile URLs). Never pass it on.
  const type = res.headers.get('content-type') || '';
  if (/json|text|xml/.test(type)) {
    const body = (await res.text()).replaceAll(env.TOMTOM_KEY, '');
    const out = new Response(body, res);
    out.headers.delete('content-length');
    return out;
  }
  return new Response(res.body, res);
}

/* Browsers say where a request comes from. Turn away requests that another website's
   pages make, so others can't run their maps on our quota. (Scripts outside a browser
   can fake these headers; a Cloudflare rate-limiting rule on /api/* covers that.) */
function fromOtherSite(request, url) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  return Boolean(origin && origin !== url.origin);
}

/* Which TomTom services accept the key? Each product (map, search, routing, places)
   must be enabled for the key in the TomTom dashboard. The checks go through
   proxyTomTom exactly like the app's requests do. The key itself is never shown. */
async function health(env) {
  if (!env.TOMTOM_KEY) {
    return Response.json({ ok: false, TOMTOM_KEY: 'missing: add it as a Secret on the Worker (Settings → Variables and secrets)' }, { status: 503 });
  }
  const SELF = 'https://mysabak.internal';
  const results = {};
  const check = async (name, path, init = {}) => {
    const url = new URL(SELF + PREFIX + path);
    const headers = { 'sec-fetch-site': 'same-origin', ...init.headers };
    try {
      const res = await proxyTomTom(new Request(url, { ...init, headers }), env, url);
      const body = await res.text();
      results[name] = res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, tomtom_says: body.slice(0, 300) };
      return res.ok ? body : null;
    } catch (e) {
      results[name] = { ok: false, error: String(e) };
      return null;
    }
  };

  const style = await check('map style (Maps / Map Display API)', '/maps/orbis/assets/styles/0.6.0-0/style.json?apiVersion=1&map=basic_street-light');
  // The tiles the style points at (first vector source), sent through the proxy like the app does
  try {
    const source = Object.values(JSON.parse(style || '{}').sources || {}).find((x) => x.url || (x.tiles && x.tiles[0]));
    const raw = source && (source.url || source.tiles[0].replace('{z}', '15').replace('{x}', '27119').replace('{y}', '15256'));
    if (raw) {
      const u = new URL(raw);
      u.searchParams.delete('key');
      if (!u.searchParams.has('apiVersion')) u.searchParams.set('apiVersion', '1');
      await check('map tiles (Maps / Map Display API)', u.pathname + u.search);
    }
  } catch (_) { /* style didn't load: already reported */ }

  await check('address lookup (Search API)', '/search/2/reverseGeocode/10.3157,123.8854.json?language=en-US');
  await check('search as you type (Places Search API, Orbis)', '/maps/orbis/places/suggest', {
    method: 'POST',
    headers: { 'tomtom-api-version': '3', attributes: 'results', 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'Ayala', maxResults: 1, origin: { type: 'point', coordinates: [123.8854, 10.3157] } }),
  });
  await check('routes (Routing API)', '/routing/1/calculateRoute/10.3157,123.8854:10.3299,123.9058/json?travelMode=car');

  const ok = Object.values(results).every((r) => r.ok);
  return Response.json({
    ok,
    hint: ok ? 'All TomTom services accept the key.'
      : 'For each failing line, enable that product for this key in the TomTom dashboard (developer.tomtom.com → Keys), or create a key with all of them enabled.',
    results,
  }, { status: ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
}

function error(status, message) {
  return Response.json({ error: message }, { status });
}
