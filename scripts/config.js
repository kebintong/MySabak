/* =========================================================
   mysabak · demo settings
   ========================================================= */
window.MYSABAK_CONFIG = {
  // Free TomTom API key (no credit card): https://developer.tomtom.com → Dashboard.
  // One key powers the map, place search, the pickup street name and routes.
  // Free each month: 10,000 place suggestions, 20,000 address lookups,
  // 20,000 routes, 200,000 map tiles.
  // Leave empty to paste it in the app instead (saved in that browser only).
  tomtomKey: 'k1Vy6wTXDbCb7igZxXVuXEND9MB7zsBZ',

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
  rates: {
    motor: { base: null, perKm: null },
    sedan: { base: null, perKm: null },
    suv:   { base: null, perKm: null },
  },

  // No longer used (the app now runs on TomTom). Kept in case you switch back.
  geoapifyKey: '8306dce236aa44559424af076c0e3764',
};
