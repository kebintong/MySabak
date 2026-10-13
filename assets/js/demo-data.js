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
