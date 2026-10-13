/* =========================================================
   mysabak · Cloudflare Worker
   - Serves the app's files (the "assets" in wrangler.jsonc).
   - Forwards /api/tomtom/* to api.tomtom.com with the API key added.
     The key is a Cloudflare secret (TOMTOM_KEY), so it is never in GitHub
     or in the browser.
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
  headers.set('TomTom-Api-Key', env.TOMTOM_KEY); // the Places Search API reads the key from this header

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

function error(status, message) {
  return Response.json({ error: message }, { status });
}
