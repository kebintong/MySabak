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
  // `parcel` is what each vehicle carries in Express mode.
  vehicles: [
    { id: 'motor', name: 'Motor', capacity: '1 passenger', parcel: 'Small parcels', icon: 'i-motor', base: null, perKm: null },
    { id: 'sedan', name: 'Sedan', capacity: 'Up to 4',     parcel: 'Boxes',         icon: 'i-car',   base: null, perKm: null },
    { id: 'suv',   name: 'SUV',   capacity: 'Up to 6',     parcel: 'Large items',   icon: 'i-suv',   base: null, perKm: null },
  ],
  defaultVehicle: 'sedan',
  paymentMethod: '[Payment method]',

  // Express (parcel delivery) sizes, shown in the parcel details form
  parcelSizes: [
    { id: 'small',  name: 'Small',  hint: 'Fits in a bag: documents, phone, food' },
    { id: 'medium', name: 'Medium', hint: 'Shoebox to backpack size' },
    { id: 'large',  name: 'Large',  hint: 'Bigger boxes; pick Sedan or SUV' },
  ],

  // Tips: optional, nothing picked by default, 100% to mysabak (drivers keep 100% of the fare).
  // E-wallet or card only, so drivers never handle mysabak's money on cash trips.
  tips: {
    presets: [10, 20, 50],
    max: 500,
    methods: [
      { id: 'gcash', name: 'GCash' },
      { id: 'maya',  name: 'Maya' },
      { id: 'card',  name: 'Card' },
    ],
  },

  // Shop delivery fee: base + perKm × distance from the shop (100% to the rider).
  // Left as null, checkout shows ₱[AMOUNT].
  delivery: { base: null, perKm: null },
  shopPaymentMethods: [
    { id: 'gcash', name: 'GCash' },
    { id: 'maya',  name: 'Maya' },
    { id: 'card',  name: 'Card' },
    { id: 'cash',  name: 'Cash on delivery' },
  ],

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
