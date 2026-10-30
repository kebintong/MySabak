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

/* Shops come from the backend (listShops / shopMenu). Shape: PANELS.md → Shop.
   SAMPLE shops for the demo, three per category: made-up names, approximate Cebu City spots, sample prices.
   Delete with this file once listShops calls your API. */
const shop = (id, name, category, area, lng, lat, [opensAt, closesAt, hours], color, tint, rating, about, menu) => ({
  id, name, sign: name.toUpperCase(), category, area, address: `${area}, Cebu City`, phone: null,
  lng, lat, hours, opensAt, closesAt, color, tint, rating, image: null, about, menu,
});
const item = (id, name, price, section, note, extra = {}) => ({ id, name, price, section, note, image: null, options: [], ...extra });
const AM7_PM9 = ['07:00', '21:00', '7:00 AM – 9:00 PM'];
const AM6_PM8 = ['06:00', '20:00', '6:00 AM – 8:00 PM'];
const AM8_PM10 = ['08:00', '22:00', '8:00 AM – 10:00 PM'];

export const SHOPS = [
  // Food
  shop('lola-pining', 'Lola Pining’s Carinderia', 'food', 'Fuente Osmeña', 123.8945, 10.3115, AM7_PM9, '#c2410c', '#fdeee4', 4.8,
    'Home-cooked Filipino dishes, made fresh every morning.', [
      item('adobo', 'Chicken adobo + rice', 110, 'Mains', 'Chicken braised in soy, vinegar and garlic, with steamed rice.', { image: '/assets/images/food-adobo.svg', options: [variant([['Solo', 0], ['Sharing', 100]])] }),
      item('sinigang', 'Pork sinigang', 140, 'Mains', 'Sour tamarind soup with pork belly and vegetables.', { image: '/assets/images/food-sinigang.svg' }),
      item('lumpia', 'Lumpiang shanghai', 80, 'Sides', 'Crispy pork spring rolls with sweet chili dip.', { image: '/assets/images/food-lumpia.svg', options: [variant([['6 pcs', 0], ['12 pcs', 70]], 'Pieces')] }),
      item('leche', 'Leche flan', 55, 'Desserts', 'Silky egg custard under dark caramel.', { image: '/assets/images/food-leche.svg' }),
      item('icedtea', 'Iced tea', 30, 'Drinks', 'Brewed black tea with calamansi.', { image: '/assets/images/food-icedtea.svg' }),
    ]),
  shop('sugbo-lechon', 'Sugbo Lechon House', 'food', 'Mabolo', 123.9140, 10.3168, AM8_PM10, '#b91c1c', '#fde8e8', 4.9,
    'Cebu-style roast pork with crackling skin.', [
      item('lechon', 'Lechon belly', 220, 'Lechon', 'Roast pork belly stuffed with lemongrass.', { options: [variant([['¼ kilo', 0], ['½ kilo', 200], ['1 kilo', 580]])] }),
      item('lechon-rice', 'Lechon rice bowl', 150, 'Lechon', 'Chopped lechon over garlic rice, with liver sauce.'),
      item('puso', 'Puso (hanging rice)', 15, 'Sides', 'Rice cooked in woven coconut leaves.', { image: '/assets/images/food-rice.svg' }),
      item('icedtea', 'Iced tea', 35, 'Drinks', 'Brewed black tea with calamansi.', { image: '/assets/images/food-icedtea.svg' }),
    ]),
  shop('isla-noodle', 'Isla Noodle Bar', 'food', 'IT Park, Lahug', 123.9062, 10.3292, AM8_PM10, '#0f766e', '#e2f5f2', 4.6,
    'Noodle soups and stir-fries, quick and filling.', [
      item('mami', 'Beef mami', 130, 'Noodles', 'Egg noodles in beef broth with tender brisket.'),
      item('canton', 'Pancit canton', 120, 'Noodles', 'Stir-fried egg noodles with pork, shrimp and vegetables.', { options: [variant([['Solo', 0], ['Good for 3', 160]])] }),
      item('siomai', 'Pork siomai', 70, 'Sides', 'Steamed dumplings with chili-garlic and soy.', { options: [variant([['4 pcs', 0], ['8 pcs', 60]], 'Pieces')] }),
      item('calamansi', 'Calamansi juice', 40, 'Drinks', 'Freshly squeezed, lightly sweetened.'),
    ]),
  // Coffee
  shop('bukid-brew', 'Bukid Brew Coffee', 'coffee', 'Banilad', 123.9112, 10.3428, AM7_PM9, '#7c4a1e', '#f5ece2', 4.7,
    'Local beans, roasted in small batches.', [
      item('latte', 'Café latte', 120, 'Coffee', 'Espresso with steamed milk.', { options: [variant([['Hot 12 oz', 0], ['Iced 16 oz', 20]])] }),
      item('spanish', 'Spanish latte', 140, 'Coffee', 'Sweetened with condensed milk.', { options: [variant([['Hot 12 oz', 0], ['Iced 16 oz', 20]])] }),
      item('coldbrew', 'Cold brew', 130, 'Coffee', 'Steeped for 18 hours, smooth and strong.'),
      item('ensaymada', 'Ensaymada', 75, 'Pastries', 'Soft brioche with butter, sugar and cheese.'),
    ]),
  shop('kape-kanto', 'Kapé Kanto', 'coffee', 'Capitol Site', 123.8925, 10.3168, AM6_PM8, '#92400e', '#fbefe0', 4.5,
    'Strong barako coffee and merienda favorites.', [
      item('barako', 'Barako brew', 80, 'Coffee', 'Bold Batangas barako, brewed black.'),
      item('mocha', 'Iced mocha', 130, 'Coffee', 'Espresso, chocolate and milk over ice.'),
      item('tablea', 'Tablea hot chocolate', 95, 'Drinks', 'Thick hot chocolate made with local cacao.'),
      item('bananabread', 'Banana bread', 65, 'Pastries', 'Moist loaf slice with walnuts.'),
    ]),
  shop('daybreak', 'Daybreak Roasters', 'coffee', 'Lahug', 123.8985, 10.3330, AM7_PM9, '#334155', '#e8edf3', 4.8,
    'Specialty coffee, pastries and a quiet corner.', [
      item('flatwhite', 'Flat white', 135, 'Coffee', 'Double ristretto with velvety milk.'),
      item('americano', 'Iced americano', 110, 'Coffee', 'Espresso and cold water over ice.', { options: [variant([['16 oz', 0], ['22 oz', 25]])] }),
      item('matcha', 'Matcha latte', 150, 'Not coffee', 'Ceremonial-grade matcha with milk.'),
      item('croissant', 'Butter croissant', 90, 'Pastries', 'Flaky, baked every morning.'),
    ]),
  // Bakery
  shop('panaderya-tasyo', 'Panaderya ni Tasyo', 'bakery', 'Guadalupe', 123.8815, 10.3215, AM6_PM8, '#a16207', '#fdf3dc', 4.8,
    'Neighborhood bakery: pandesal hot from the oven.', [
      item('pandesal', 'Pandesal', 30, 'Bread', 'Soft bread rolls dusted with crumbs.', { options: [variant([['10 pcs', 0], ['20 pcs', 30]], 'Pieces')] }),
      item('ube-pandesal', 'Ube cheese pandesal', 25, 'Bread', 'Purple yam roll with melty cheese inside.'),
      item('spanish-bread', 'Spanish bread', 12, 'Bread', 'Rolled bun with buttery sugar filling.'),
      item('ensaymada', 'Ensaymada', 35, 'Sweets', 'Brioche with butter, sugar and cheese.'),
    ]),
  shop('masa-mantikilya', 'Masa & Mantikilya Bakeshop', 'bakery', 'Colon', 123.8992, 10.2968, AM7_PM9, '#be185d', '#fce7f1', 4.6,
    'Old-school Cebuano pastries and cakes.', [
      item('mamon', 'Mamon', 28, 'Cakes', 'Light, buttery chiffon cupcake.'),
      item('pianono', 'Pianono', 45, 'Cakes', 'Sponge roll with butter and sugar.'),
      item('otap', 'Otap', 90, 'Sweets', 'Crisp, flaky puff biscuits, a Cebu favorite.', { options: [variant([['Pack of 10', 0], ['Pack of 20', 80]], 'Pack')] }),
      item('hopia', 'Hopia', 20, 'Sweets', 'Flaky pastry filled with mung bean or ube.', { options: [variant([['Mung bean', 0], ['Ube', 5]], 'Filling')] }),
    ]),
  shop('golden-crust', 'Golden Crust Bakery', 'bakery', 'Robinsons Galleria area', 123.9095, 10.3040, AM8_PM10, '#ca8a04', '#fdf6dc', 4.7,
    'Breads, pies and party trays.', [
      item('ube-loaf', 'Ube loaf', 120, 'Bread', 'Soft loaf swirled with ube halaya.'),
      item('cheese-roll', 'Cheese roll', 35, 'Bread', 'Buttery roll with cheese and sugar.'),
      item('egg-pie', 'Egg pie', 280, 'Pies', 'Creamy custard in a flaky crust, whole pie.'),
      item('brownies', 'Fudge brownies', 60, 'Sweets', 'Rich and chewy.', { options: [variant([['1 pc', 0], ['Box of 6', 260]])] }),
    ]),
  // Groceries
  shop('kanto-mart', 'Tindahan sa Kanto Mart', 'grocery', 'Carbon', 123.8980, 10.2935, AM6_PM8, '#15803d', '#e4f5e9', 4.5,
    'Everyday basics at neighborhood prices.', [
      item('rice', 'Rice, well-milled', 290, 'Staples', 'Local rice.', { options: [variant([['5 kg', 0], ['10 kg', 280]], 'Bag')] }),
      item('eggs', 'Eggs, medium', 95, 'Staples', 'Fresh farm eggs.', { options: [variant([['12 pcs', 0], ['Tray of 30', 135]], 'Pack')] }),
      item('oil', 'Cooking oil', 110, 'Staples', 'Coconut cooking oil, 1 liter.'),
      item('sardines', 'Sardines in tomato sauce', 28, 'Canned', '155 g can.'),
      item('noodles', 'Instant noodles', 16, 'Canned', 'Chicken flavor, one pack.'),
    ]),
  shop('fresh-haven', 'Fresh Haven Market', 'grocery', 'Lahug', 123.9020, 10.3310, AM7_PM9, '#4d7c0f', '#eef6df', 4.7,
    'Fresh produce, meat and fish, picked daily.', [
      item('bananas', 'Lakatan bananas', 95, 'Fruits & vegetables', 'About 1 kg.'),
      item('tomatoes', 'Tomatoes', 60, 'Fruits & vegetables', 'Half a kilo.'),
      item('onions', 'Red onions', 70, 'Fruits & vegetables', 'Half a kilo.'),
      item('liempo', 'Pork liempo', 175, 'Meat & fish', 'Pork belly, sliced.', { options: [variant([['½ kg', 0], ['1 kg', 170]], 'Weight')] }),
      item('chicken', 'Whole chicken', 260, 'Meat & fish', 'Dressed, about 1.2 kg.'),
    ]),
  shop('pantry-plus', 'Pantry Plus Groceries', 'grocery', 'South Road Properties', 123.8800, 10.2830, AM8_PM10, '#0369a1', '#e1f0f9', 4.6,
    'Pantry staples, drinks and snacks.', [
      item('milk', 'Fresh milk', 105, 'Dairy', '1 liter.'),
      item('loaf', 'White bread loaf', 75, 'Bakery', 'Sliced sandwich bread.'),
      item('coffee', 'Coffee 3-in-1', 85, 'Drinks', '10 sachets.'),
      item('cornedbeef', 'Corned beef', 45, 'Canned', '150 g can.'),
    ]),
  // Essentials
  shop('botika-kalinaw', 'Botika Kalinaw', 'essentials', 'Mabolo', 123.9150, 10.3190, AM7_PM9, '#0e7490', '#e0f4f8', 4.8,
    'Neighborhood pharmacy for everyday health needs.', [
      item('paracetamol', 'Paracetamol 500 mg', 45, 'Medicine', '10 tablets.'),
      item('vitc', 'Vitamin C 500 mg', 120, 'Vitamins', '30 tablets.'),
      item('masks', 'Face masks', 60, 'Care', '10 pcs, 3-ply.'),
      item('alcohol', 'Isopropyl alcohol 70%', 95, 'Care', '500 ml.'),
    ]),
  shop('kanto-essentials', 'Kanto Essentials', 'essentials', 'Fuente Osmeña', 123.8952, 10.3102, AM7_PM9, '#6d28d9', '#efe7fd', 4.5,
    'Household basics for home and kitchen.', [
      item('tissue', 'Toilet paper', 85, 'Home', '4 rolls.'),
      item('dishsoap', 'Dishwashing liquid', 65, 'Kitchen', '250 ml.'),
      item('detergent', 'Laundry powder', 120, 'Home', '1 kg.'),
      item('trashbags', 'Trash bags', 55, 'Home', '10 pcs, large.'),
    ]),
  shop('baby-care', 'Baby & Care Corner', 'essentials', 'Cebu Business Park', 123.9050, 10.3185, AM8_PM10, '#db2777', '#fde7f2', 4.7,
    'Baby needs and personal care.', [
      item('diapers', 'Baby diapers', 380, 'Baby', 'Pack of 32.', { options: [variant([['Small', 0], ['Medium', 20], ['Large', 40]])] }),
      item('wipes', 'Baby wipes', 70, 'Baby', '80 sheets, unscented.'),
      item('shampoo', 'Shampoo', 150, 'Personal care', '340 ml.'),
      item('toothpaste', 'Toothpaste', 90, 'Personal care', '150 g.'),
    ]),
];

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
    // The merchant's own shop. Not listed on the Shops page (only the SAMPLE shops above are).
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
