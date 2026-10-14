/* =========================================================
   mysabak · data for the demo
   BACKEND: delete this file once api.js calls your API. The shapes are in PANELS.md.
   ========================================================= */

export const SHOP_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'food', name: 'Food' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'grocery', name: 'Groceries' },
  { id: 'essentials', name: 'Essentials' },
];

/* Shops come from the backend (listShops / shopMenu). The demo has none, so the Shops
   screen shows its "no shops yet" state. Shape: PANELS.md → Shop. */
export const SHOPS = [];

/* Ride / Express: the driver the demo "finds" after booking, one per vehicle type.
   SAMPLE people and plates, shown with a "Demo" tag. Live app: findDriver() returns the real driver. */
export const DEMO_DRIVERS = {
  motor: { name: 'Jun D.', rating: 4.9, trips: 1240, vehicle: { model: 'Honda Click 125', color: 'Red', plate: '123 ABC' } },
  sedan: { name: 'Mark R.', rating: 4.8, trips: 860, vehicle: { model: 'Toyota Vios', color: 'White', plate: 'ABC 1234' } },
  suv: { name: 'Liza M.', rating: 4.9, trips: 530, vehicle: { model: 'Toyota Innova', color: 'Silver', plate: 'NBC 5678' } },
};

/* Demo accounts, so the company can try the driver and merchant sides.
   SAMPLE logins: delete with this file when real accounts exist (passwords are checked on the server). */
export const DEMO_ACCOUNTS = {
  client: {
    phone: '09170000003', email: 'client@mysabak.demo', password: 'mysabak-demo',
    name: 'Demo Customer', city: 'Cebu City',
  },
  driver: {
    phone: '09170000001', email: 'driver@mysabak.demo', password: 'mysabak-demo',
    name: 'Demo Driver', city: 'Cebu City', vehicle: 'sedan', plate: 'DMO 1234', model: 'Toyota Vios', year: 2021, status: 'approved',
  },
  merchant: {
    phone: '09170000002', email: 'merchant@mysabak.demo', password: 'mysabak-demo',
    name: 'Demo Merchant',
    // The merchant's own shop. Not listed on the Shops page (the demo has no public shops).
    shop: {
      id: 'demo-kitchen', name: 'Demo Kitchen', sign: 'DEMO KITCHEN', category: 'food', area: 'Capitol Site',
      address: 'Escario St, Capitol Site, Cebu City', phone: '0917 000 0002',
      lng: 123.8930, lat: 10.3180, hours: '9:00 AM – 9:00 PM', opensAt: '09:00', closesAt: '21:00',
      color: '#5630d8', tint: '#ece6ff', image: null,
      menu: [
        { id: 'adobo', name: 'Chicken adobo + rice', price: 120, section: 'Mains', image: null, options: [] },
        { id: 'sinigang', name: 'Pork sinigang', price: 150, section: 'Mains', image: null, options: [] },
        { id: 'lumpia', name: 'Lumpia (6 pcs)', price: 85, section: 'Sides', image: null, options: [] },
        { id: 'rice', name: 'Extra rice', price: 20, section: 'Sides', image: null, options: [] },
        { id: 'leche', name: 'Leche flan', price: 60, section: 'Desserts', image: null, options: [] },
      ],
    },
  },
};

/* Merchant demo: a few SAMPLE orders for Demo Kitchen (placed `minutesAgo` before the merchant first opens the
   dashboard) and last week's sales, so the dashboard isn't empty. Tagged "Sample" on screen. */
export const DEMO_MERCHANT_ORDERS = [
  { id: 'DK-1042', customer: 'Ana', minutesAgo: 2, status: 'placed', notes: 'Please add extra sauce.',
    lines: [{ name: 'Chicken adobo + rice', qty: 2, price: 120 }, { name: 'Leche flan', qty: 1, price: 60 }] },
  { id: 'DK-1041', customer: 'Paolo', minutesAgo: 6, status: 'placed', notes: '',
    lines: [{ name: 'Pork sinigang', qty: 1, price: 150 }, { name: 'Extra rice', qty: 2, price: 20 }] },
  { id: 'DK-1040', customer: 'Kim', minutesAgo: 14, status: 'preparing', notes: '',
    lines: [{ name: 'Lumpia (6 pcs)', qty: 2, price: 85 }] },
  { id: 'DK-1039', customer: 'Rhea', minutesAgo: 25, status: 'ready', notes: 'No utensils.',
    lines: [{ name: 'Chicken adobo + rice', qty: 1, price: 120 }, { name: 'Lumpia (6 pcs)', qty: 1, price: 85 }] },
  { id: 'DK-1038', customer: 'Jomar', minutesAgo: 70, status: 'delivered', notes: '',
    lines: [{ name: 'Pork sinigang', qty: 2, price: 150 }, { name: 'Extra rice', qty: 2, price: 20 }] },
];
/* Sales per day for the last 7 days, oldest first (the last one is today, before the sample orders). */
export const DEMO_MERCHANT_WEEK = [1840, 2210, 1675, 2490, 3120, 3560, 0];

/* Driver demo: SAMPLE job requests are made from these Cebu places (approximate positions),
   so the demo driver has Ride, Express and Shop delivery requests to try. Tagged "Demo" on screen. */
export const DEMO_PLACES = [
  { label: 'Ayala Center Cebu', lng: 123.9054, lat: 10.3181 },
  { label: 'SM City Cebu', lng: 123.9187, lat: 10.3113 },
  { label: 'Cebu IT Park', lng: 123.9058, lat: 10.3299 },
  { label: 'Fuente Osmeña Circle', lng: 123.8935, lat: 10.3108 },
  { label: 'Carbon Market', lng: 123.8984, lat: 10.2930 },
  { label: 'Robinsons Galleria Cebu', lng: 123.9097, lat: 10.3036 },
  { label: 'Cebu Provincial Capitol', lng: 123.8920, lat: 10.3172 },
  { label: 'Guadalupe Church', lng: 123.8810, lat: 10.3220 },
  { label: 'Banilad Town Centre', lng: 123.9118, lat: 10.3435 },
  { label: 'Mabolo Church', lng: 123.9145, lat: 10.3175 },
  { label: 'Colon Street', lng: 123.8990, lat: 10.2965 },
  { label: 'SM Seaside City Cebu', lng: 123.8790, lat: 10.2820 },
];
export const DEMO_RIDERS = ['Ana', 'Paolo', 'Kim', 'Rhea', 'Jomar', 'Lea'];
