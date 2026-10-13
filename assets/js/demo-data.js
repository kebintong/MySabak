/* =========================================================
   mysabak · SAMPLE data for the demo (Shop)
   Made-up shops and menus around Cebu City so the Shop screens have
   something to show. BACKEND: delete this file once api.js calls your API.
   ========================================================= */

export const SHOP_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'food', name: 'Food' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'grocery', name: 'Groceries' },
  { id: 'essentials', name: 'Essentials' },
];

export const SHOPS = [
  {
    id: 'lutong-bahay', name: 'Lutong Bahay Kitchen', category: 'food', area: 'Capitol Site',
    lng: 123.8930, lat: 10.3180, hours: '9:00 AM – 9:00 PM', color: '#f7c27a',
    menu: [
      { id: 'adobo', name: 'Chicken adobo + rice', price: 120, note: 'Classic, slow-cooked' },
      { id: 'sinigang', name: 'Pork sinigang', price: 150, note: 'Good for 1–2' },
      { id: 'lumpia', name: 'Lumpia (6 pcs)', price: 85 },
      { id: 'pancit', name: 'Pancit canton', price: 110 },
      { id: 'rice', name: 'Extra rice', price: 20 },
      { id: 'leche', name: 'Leche flan', price: 60 },
    ],
  },
  {
    id: 'kape-sugbo', name: 'Kape Sugbo', category: 'coffee', area: 'Lahug',
    lng: 123.8985, lat: 10.3290, hours: '7:00 AM – 10:00 PM', color: '#c9a27e',
    menu: [
      { id: 'barako', name: 'Barako brewed coffee', price: 90 },
      { id: 'spanish', name: 'Spanish latte (iced)', price: 140 },
      { id: 'tablea', name: 'Tablea hot chocolate', price: 120 },
      { id: 'ensaymada', name: 'Ensaymada', price: 65 },
      { id: 'banana', name: 'Banana bread slice', price: 75 },
    ],
  },
  {
    id: 'panaderia-uno', name: 'Panaderia Uno', category: 'bakery', area: 'Guadalupe',
    lng: 123.8805, lat: 10.3225, hours: '5:00 AM – 8:00 PM', color: '#fce6a4',
    menu: [
      { id: 'pandesal', name: 'Pandesal (10 pcs)', price: 50 },
      { id: 'monay', name: 'Monay (4 pcs)', price: 40 },
      { id: 'ube', name: 'Ube cheese pandesal (6 pcs)', price: 120 },
      { id: 'otap', name: 'Otap pack', price: 95 },
      { id: 'mamon', name: 'Mamon', price: 35 },
    ],
  },
  {
    id: 'tindahan-ni-aling-rosa', name: 'Tindahan ni Aling Rosa', category: 'grocery', area: 'Sambag II',
    lng: 123.8890, lat: 10.3075, hours: '6:00 AM – 10:00 PM', color: '#cce5c2',
    menu: [
      { id: 'rice5', name: 'Rice, 5 kg', price: 275 },
      { id: 'eggs', name: 'Eggs (12 pcs)', price: 110 },
      { id: 'noodles', name: 'Instant noodles (5 packs)', price: 70 },
      { id: 'sardines', name: 'Sardines (3 cans)', price: 75 },
      { id: 'coffee3', name: '3-in-1 coffee (10 sachets)', price: 85 },
      { id: 'water', name: 'Bottled water, 6 × 500 ml', price: 90 },
    ],
  },
  {
    id: 'bayanihan-essentials', name: 'Bayanihan Essentials', category: 'essentials', area: 'Kamputhaw',
    lng: 123.8950, lat: 10.3120, hours: '8:00 AM – 9:00 PM', color: '#aed2ee',
    menu: [
      { id: 'soap', name: 'Bath soap (3 bars)', price: 95 },
      { id: 'shampoo', name: 'Shampoo, 340 ml', price: 160 },
      { id: 'tissue', name: 'Tissue (4 rolls)', price: 80 },
      { id: 'detergent', name: 'Laundry powder, 1 kg', price: 120 },
      { id: 'alcohol', name: 'Rubbing alcohol, 500 ml', price: 75 },
    ],
  },
  {
    id: 'sugbo-grill', name: 'Sugbo Grill House', category: 'food', area: 'Mabolo',
    lng: 123.9120, lat: 10.3215, hours: '11:00 AM – 11:00 PM', color: '#f4b8a0',
    menu: [
      { id: 'lechon', name: 'Lechon kawali + rice', price: 165 },
      { id: 'bbq', name: 'Pork BBQ (3 sticks)', price: 105 },
      { id: 'inasal', name: 'Chicken inasal + rice', price: 140 },
      { id: 'puso', name: 'Puso (hanging rice), 2 pcs', price: 20 },
      { id: 'soda', name: 'Soft drink, 1.5 L', price: 85 },
    ],
  },
];
