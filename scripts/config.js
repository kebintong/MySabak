/* =========================================================
   mysabak · app settings (public: no keys in here)

   The TomTom API key is a secret on the server:
     Cloudflare:  npx wrangler secret put TOMTOM_KEY  (or the dashboard)
     Local:       .dev.vars (copy .dev.vars.example; git ignores it)
   TomTom free tier each month: 10,000 place suggestions, 20,000 address lookups,
   20,000 routes, 200,000 map tiles.
   ========================================================= */
window.MYSABAK_CONFIG = {
  // Map look: 'street' (mysabak street map: cream land, yellow main roads, Google Sans Text labels).
  // TomTom's own styles also work:
  // 'basic_street-light', 'basic_mono-light', 'basic_street-dark', 'basic_street-satellite'
  mapStyle: 'street',

  // Where the map opens if location is off: Cebu City [longitude, latitude]
  startCenter: [123.8854, 10.3157],
  startZoom: 15,

  // Search results: Philippines only, favouring places within this many km of the pickup
  countryCode: 'ph',
  searchRadiusKm: 40,

  // Fares. Set numbers (pesos) to show real prices: base + perKm × distance.
  // Left as null, the app shows ₱[FARE] placeholders.
  // (Before launch, fares should be worked out on the server too; see PLAN.md.)
  rates: {
    motor: { base: null, perKm: null },
    sedan: { base: null, perKm: null },
    suv:   { base: null, perKm: null },
  },
};
