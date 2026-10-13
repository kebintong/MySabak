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

  // How a ride or Express delivery is paid (chosen after tapping Book).
  // The customer can also raise the price; the extra is a tip, 100% to mysabak.
  ridePayments: [
    { id: 'cash',  name: 'Cash',           hint: 'Pay your driver at drop-off', icon: 'i-cash' },
    { id: 'gcash', name: 'GCash',          hint: 'Pay in the app',              icon: 'i-wallet' },
    { id: 'bank',  name: 'Online banking', hint: 'Pay from your bank app',      icon: 'i-bank' },
  ],
  defaultRidePayment: 'cash',
  priceStep: 5, // the − / + buttons on "Your price" move by this many pesos

  // Express (parcel delivery) sizes, shown in the parcel details form
  parcelSizes: [
    { id: 'small',  name: 'Small',  hint: 'Fits in a bag: documents, phone, food' },
    { id: 'medium', name: 'Medium', hint: 'Shoebox to backpack size' },
    { id: 'large',  name: 'Large',  hint: 'Bigger boxes; pick Sedan or SUV' },
  ],

  // Tips: optional, nothing picked by default, 100% to mysabak (drivers keep 100% of the fare).
  // On rides the tip is added to the price when booking (any payment method, see ridePayments).
  // Tips sent separately (after a trip, from a shop order, on the Support page) are e-wallet or card only.
  tips: {
    presets: [10, 20, 50],
    max: 500,
    methods: [
      { id: 'gcash', name: 'GCash' },
      { id: 'maya',  name: 'Maya' },
      { id: 'card',  name: 'Card' },
    ],
  },

  // Where walk-in driver applicants go (Drive → Sign up → Walk in).
  // SAMPLE details for the demo: replace with the real office.
  driverOffice: {
    name: 'mysabak Driver Hub · Cebu',
    address: '2F Sample Building, Osmeña Boulevard, Cebu City 6000',
    hours: 'Monday to Saturday, 9:00 AM – 5:00 PM',
    phone: '(032) 000 0000',
    lng: 123.8930,
    lat: 10.3105,
    bring: ['Driver’s license', 'Vehicle OR/CR', 'One valid government ID', 'Your smartphone'],
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
