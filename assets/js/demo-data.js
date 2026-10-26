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

/** A required "Size" (or other) choice whose prices are added to the item price. */
const variant = (choices, name = 'Size') => ({
  id: 'size', name, type: 'one', required: true, choices: choices.map(([n, price]) => ({ name: n, price })),
});

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
      // SAMPLE menu: drawn pictures (assets/images/food-*.svg), a short description (`note`) and variants as a
      // required single-choice option; each variant's price is added to the item price.
      menu: [
        { id: 'adobo', name: 'Chicken adobo + rice', price: 120, section: 'Mains', image: '/assets/images/food-adobo.svg',
          note: 'Chicken braised in soy, vinegar and garlic, with steamed rice.',
          options: [variant([['Solo', 0], ['Sharing', 110], ['Family', 260]])] },
        { id: 'sinigang', name: 'Pork sinigang', price: 150, section: 'Mains', image: '/assets/images/food-sinigang.svg',
          note: 'Sour tamarind soup with pork belly, kangkong, radish and tomato.',
          options: [variant([['Bowl', 0], ['Good for 3', 140]])] },
        { id: 'lumpia', name: 'Lumpiang shanghai', price: 85, section: 'Sides', image: '/assets/images/food-lumpia.svg',
          note: 'Crispy pork spring rolls with sweet chili dip.',
          options: [variant([['6 pcs', 0], ['12 pcs', 75], ['24 pcs', 155]], 'Pieces')] },
        { id: 'rice', name: 'Rice', price: 20, section: 'Sides', image: '/assets/images/food-rice.svg',
          note: 'Freshly steamed, or fried with toasted garlic.',
          options: [variant([['Plain', 0], ['Garlic', 10]], 'Kind')] },
        { id: 'leche', name: 'Leche flan', price: 60, section: 'Desserts', image: '/assets/images/food-leche.svg',
          note: 'Silky egg custard under dark caramel.',
          options: [variant([['Slice', 0], ['Whole llanera', 160]])] },
        { id: 'icedtea', name: 'House iced tea', price: 35, section: 'Drinks', image: '/assets/images/food-icedtea.svg',
          note: 'Brewed black tea with calamansi.',
          options: [variant([['Regular', 0], ['Large', 15], ['Pitcher', 85]])] },
      ],
    },
  },
};

/* Merchant demo: a few SAMPLE orders for Demo Kitchen (placed `minutesAgo` before the merchant first opens the
   dashboard) and last week's sales, so the dashboard isn't empty. Tagged "Sample" on screen. */
export const DEMO_MERCHANT_ORDERS = [
  { id: 'DK-1042', customer: 'Ana', minutesAgo: 2, status: 'placed', notes: 'Please add extra sauce.',
    lines: [{ name: 'Chicken adobo + rice', qty: 1, price: 230, options: ['Sharing'] }, { name: 'Leche flan', qty: 1, price: 60, options: ['Slice'] }] },
  { id: 'DK-1041', customer: 'Paolo', minutesAgo: 6, status: 'placed', notes: '',
    lines: [{ name: 'Pork sinigang', qty: 1, price: 150 }, { name: 'Rice', qty: 2, price: 30, options: ['Garlic'] }] },
  { id: 'DK-1040', customer: 'Kim', minutesAgo: 14, status: 'preparing', notes: '',
    lines: [{ name: 'Lumpiang shanghai', qty: 1, price: 160, options: ['12 pcs'] }] },
  { id: 'DK-1039', customer: 'Rhea', minutesAgo: 25, status: 'ready', notes: 'No utensils.',
    lines: [{ name: 'Chicken adobo + rice', qty: 1, price: 120 }, { name: 'Lumpiang shanghai', qty: 1, price: 85, options: ['6 pcs'] }] },
  { id: 'DK-1038', customer: 'Jomar', minutesAgo: 70, status: 'delivered', notes: '',
    lines: [{ name: 'Pork sinigang', qty: 2, price: 150 }, { name: 'Rice', qty: 2, price: 30, options: ['Garlic'] }] },
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

/* Merchant POS demo: Demo Kitchen's SAMPLE ingredients and recipes, so the inventory isn't empty.
   Ingredient: { id, name, unit, stock, low (warn at or below this), cost (₱ per unit), group }.
   Recipe (per menu item): what ONE order of the first variant uses, and how much more each bigger variant uses
   ({ lines: [{ id: ingredientId, qty }], scale: { 'Variant name': multiplier } }). Shapes: PANELS.md → POS. */
export const DEMO_INVENTORY = {
  ingredients: [
    { id: 'chicken', name: 'Chicken cut-ups', unit: 'kg', stock: 6.5, low: 3, cost: 210, group: 'Meat' },
    { id: 'pork-belly', name: 'Pork belly', unit: 'kg', stock: 2.4, low: 3, cost: 340, group: 'Meat' },
    { id: 'ground-pork', name: 'Ground pork', unit: 'kg', stock: 3, low: 1.5, cost: 280, group: 'Meat' },
    { id: 'rice', name: 'Rice', unit: 'kg', stock: 22, low: 10, cost: 52, group: 'Dry goods' },
    { id: 'sinigang-mix', name: 'Sinigang mix', unit: 'pack', stock: 14, low: 6, cost: 22, group: 'Dry goods' },
    { id: 'sugar', name: 'Sugar', unit: 'kg', stock: 5, low: 2, cost: 75, group: 'Dry goods' },
    { id: 'tea', name: 'Black tea bags', unit: 'pc', stock: 60, low: 40, cost: 3, group: 'Dry goods' },
    { id: 'soy', name: 'Soy sauce', unit: 'L', stock: 3.2, low: 1, cost: 85, group: 'Sauces' },
    { id: 'vinegar', name: 'Cane vinegar', unit: 'L', stock: 2.5, low: 1, cost: 60, group: 'Sauces' },
    { id: 'oil', name: 'Cooking oil', unit: 'L', stock: 6, low: 3, cost: 110, group: 'Sauces' },
    { id: 'garlic', name: 'Garlic', unit: 'kg', stock: 0.6, low: 1, cost: 180, group: 'Produce' },
    { id: 'kangkong', name: 'Kangkong', unit: 'bundle', stock: 8, low: 5, cost: 15, group: 'Produce' },
    { id: 'radish', name: 'Radish', unit: 'kg', stock: 1.2, low: 1, cost: 70, group: 'Produce' },
    { id: 'tomato', name: 'Tomato', unit: 'kg', stock: 1.5, low: 1, cost: 90, group: 'Produce' },
    { id: 'calamansi', name: 'Calamansi', unit: 'kg', stock: 0, low: 0.5, cost: 120, group: 'Produce' },
    { id: 'wrapper', name: 'Lumpia wrapper', unit: 'pc', stock: 180, low: 100, cost: 1.5, group: 'Produce' },
    { id: 'eggs', name: 'Eggs', unit: 'pc', stock: 24, low: 30, cost: 8.5, group: 'Dairy & eggs' },
    { id: 'condensed', name: 'Condensed milk', unit: 'can', stock: 9, low: 6, cost: 58, group: 'Dairy & eggs' },
    { id: 'evap', name: 'Evaporated milk', unit: 'can', stock: 7, low: 6, cost: 42, group: 'Dairy & eggs' },
    { id: 'boxes', name: 'Meal boxes', unit: 'pc', stock: 65, low: 80, cost: 6, group: 'Packaging' },
    { id: 'cups', name: '16 oz cups + lids', unit: 'pc', stock: 140, low: 100, cost: 4.5, group: 'Packaging' },
  ],
  recipes: {
    adobo: { lines: [{ id: 'chicken', qty: 0.25 }, { id: 'soy', qty: 0.03 }, { id: 'vinegar', qty: 0.03 }, { id: 'garlic', qty: 0.015 }, { id: 'rice', qty: 0.12 }, { id: 'boxes', qty: 1 }],
      scale: { Sharing: 2, Family: 4 } },
    sinigang: { lines: [{ id: 'pork-belly', qty: 0.2 }, { id: 'sinigang-mix', qty: 0.5 }, { id: 'kangkong', qty: 0.5 }, { id: 'radish', qty: 0.08 }, { id: 'tomato', qty: 0.06 }],
      scale: { 'Good for 3': 3 } },
    lumpia: { lines: [{ id: 'ground-pork', qty: 0.09 }, { id: 'wrapper', qty: 6 }, { id: 'oil', qty: 0.05 }, { id: 'boxes', qty: 1 }],
      scale: { '12 pcs': 2, '24 pcs': 4 } },
    rice: { lines: [{ id: 'rice', qty: 0.12 }], scale: {} },
    leche: { lines: [{ id: 'eggs', qty: 1.5 }, { id: 'condensed', qty: 0.25 }, { id: 'evap', qty: 0.25 }, { id: 'sugar', qty: 0.02 }],
      scale: { 'Whole llanera': 4 } },
    icedtea: { lines: [{ id: 'tea', qty: 1 }, { id: 'sugar', qty: 0.02 }, { id: 'calamansi', qty: 0.02 }, { id: 'cups', qty: 1 }],
      scale: { Large: 1.5, Pitcher: 4 } },
  },
};
