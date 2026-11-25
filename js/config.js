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
  // `parcel` is what each vehicle carries in Express mode. `art` is the picture on its ride option.
  vehicles: [
    { id: 'motor', name: 'Motor', capacity: '1 passenger', parcel: 'Small parcels', icon: 'i-motor', art: 'moto', base: null, perKm: null },
    { id: 'sedan', name: 'Sedan', capacity: 'Up to 4',     parcel: 'Boxes',         icon: 'i-car',   art: 'car',  base: null, perKm: null },
    { id: 'suv',   name: 'SUV',   capacity: 'Up to 6',     parcel: 'Large items',   icon: 'i-suv',   art: 'suv',  base: null, perKm: null },
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

  // The platform fee: a flat amount for each completed trip, charged to the driver, never a percentage and never taken
  // from the fare the customer pays (drivers keep the whole fare). Approved for Ride, Parcel and Food.
  // shortcut: Cargo is left out until management approves a Cargo fee; add 'cargo' to kinds then.
  platformFee: { perTrip: 10, kinds: ['ride', 'express', 'shop'] },

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

  // Cargo (Ride screen → Cargo): vans and trucks. SAMPLE capacities and rates for the demo only: the live app
  // gets them from the server (cargoQuote() in api.js). Sizes in cm, weight in kg, money in centavos (₱1 = 100).
  cargo: {
    ruleVersion: 'sample-2026-11',
    vehicles: [
      { id: 'motor', name: 'Motorcycle', icon: 'i-motor', art: 'moto', maxKg: 20, lengthCm: 50, widthCm: 40, heightCm: 50, base: 4900, perKm: 600 },
      { id: 'sedan', name: 'Sedan', icon: 'i-car', art: 'car', maxKg: 200, lengthCm: 100, widthCm: 60, heightCm: 50, base: 10000, perKm: 1500 },
      { id: 'mpv', name: 'MPV / SUV', icon: 'i-suv', art: 'suv', maxKg: 300, lengthCm: 150, widthCm: 100, heightCm: 90, base: 15000, perKm: 1800 },
      { id: 'van', name: 'Van', icon: 'i-truck', art: 'van', maxKg: 600, lengthCm: 210, widthCm: 120, heightCm: 120, base: 25000, perKm: 2200 },
      { id: 'truck', name: 'Truck', icon: 'i-truck', art: 'truck', maxKg: 2000, lengthCm: 400, widthCm: 180, heightCm: 180, base: 60000, perKm: 3000 },
    ],
    defaultVehicle: 'van',
    types: ['Furniture', 'Appliances', 'Boxes', 'Construction', 'Equipment', 'Other'],
    fragileFee: 5000,
    helpers: { available: true, max: 2, fee: 15000 }, // loading and unloading, only when real staff can go
    quoteMinutes: 10, // a quote holds its price this long
    // shortcut: a box around mainland Cebu and Mactan, not real roads, islands or ferries; the server decides the area
    area: { name: 'Cebu', west: 123.25, east: 124.08, south: 9.4, north: 11.3 },
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
