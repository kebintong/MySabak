/* =========================================================
   mysabak · app settings (public: no keys in here)

   Everything the screens need that isn't live data: vehicles, fares,
   where the map starts, how search behaves. API keys live on the server,
   never here (see README.md).
   ========================================================= */
export const CONFIG = {
  currency: '₱',

  // Vehicle cards on "Choose a vehicle". Fares: base + perKm × distance (pesos).
  // Left as null, the cards show ₱[FARE] placeholders.
  // Backend: fares can come from the server instead; see faresFor() in api.js and PANELS.md.
  vehicles: [
    { id: 'motor', name: 'Motor', capacity: '1 passenger', icon: 'i-motor', base: null, perKm: null },
    { id: 'sedan', name: 'Sedan', capacity: 'Up to 4',     icon: 'i-car',   base: null, perKm: null },
    { id: 'suv',   name: 'SUV',   capacity: 'Up to 6',     icon: 'i-suv',   base: null, perKm: null },
  ],
  defaultVehicle: 'sedan',
  paymentMethod: '[Payment method]',

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
  language: 'en-US',
};
