/* =========================================================
   mysabak · SAMPLE data for the demo (Shop)
   Made-up shops and menus around Cebu City so the Shop screens have
   something to show. BACKEND: delete this file once api.js calls your API.
   The shapes are in PANELS.md → Shop.
   ========================================================= */

export const SHOP_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'food', name: 'Food' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'grocery', name: 'Groceries' },
  { id: 'essentials', name: 'Essentials' },
];

/* ---------- Ordering options, by kind of item ---------- */
const choices = (list) => list.map(([name, price = 0, hint]) => (hint ? { name, price, hint } : { name, price }));
const one = (id, name, list, more = {}) => ({ id, name, type: 'one', required: true, choices: choices(list), ...more });
const pick = (id, name, list, more = {}) => ({ id, name, type: 'one', required: false, choices: choices(list), ...more });
const many = (id, name, max, list) => ({ id, name, type: 'many', required: false, max, choices: choices(list) });
const r5 = (n) => Math.round(n / 5) * 5;

const meal = (dessert) => one('meal', 'Make it a meal', [['Ala carte'], ['Meal', 45, 'with a regular drink'], ['Super meal', 95, `with a drink and ${dessert}`]]);
const drink = one('drink', 'Choose your drink', [['Iced tea'], ['Cola'], ['Sago’t gulaman', 10], ['Calamansi juice', 15], ['Fresh buko juice', 30]],
  { showIf: { group: 'meal', notIn: ['Ala carte'] } });
const pairDrink = pick('pair', 'Pair with a drink', [['No drink'], ['Brewed coffee', 40], ['Hot tablea chocolate', 45]]);

function optionsFor(kind, price, art) {
  switch (kind) {
    case 'dish': return [
      one('size', 'Size', [['Solo', 0, '1 person'], ['Sharing', 110, 'good for 2–3'], ['Family', 260, 'good for 4–5']]),
      meal('leche flan'), drink,
      one('rice', 'Rice', [['Plain rice'], ['Garlic rice', 15], ['Java rice', 20], ['No rice']]),
      many('add', 'Add-ons', 3, [['Fried egg', 20], ['Extra sauce', 10], ['Atchara', 15], ['Chicharon', 25]]),
      pick('spice', 'Spice level', [['Regular'], ['Mild'], ['Spicy'], ['Extra spicy']])];
    case 'soup': return [
      one('size', 'Size', [['Good for 1–2'], ['Good for 3–4', 120], ['Family pot', 240, 'good for 6']]),
      meal('leche flan'), drink,
      pick('sour', 'Sourness', [['Regular asim'], ['Mild'], ['Extra asim']]),
      many('add', 'Add-ons', 4, [['Extra pork', 45], ['Extra kangkong', 15], ['Extra gabi', 15], ['Cup of rice', 20]])];
    case 'side': return [
      one('size', 'Portion', [['Regular'], ['Sharing', 75, 'double portion'], ['Party tray', 240, 'good for 8']]),
      many('dip', 'Dips and extras', 3, [['Spiced vinegar'], ['Sweet chili', 10], ['Garlic mayo', 15], ['Calamansi', 5]])];
    case 'rice': return [one('rice', 'Rice', [['Plain'], ['Garlic', 15], ['Java', 20]])];
    case 'puso': return [one('pack', 'How many', [['2 pieces'], ['Pack of 6', 35], ['Pack of 10', 70]])];
    case 'dessert': return [
      one('size', 'Size', [['Single'], ['Pack of 4', r5(price * 3), 'save 25%']]),
      many('top', 'Toppings', 2, [['Extra caramel', 10], ['Cream cheese', 20], ['Toasted pinipig', 15]])];
    case 'bread': return [
      one('pack', 'Pack size', [['As listed'], ['Double pack', r5(price * 0.9), 'save 10%'], ['Party bag ×4', r5(price * 2.4), 'save 15%']]),
      pick('warm', 'Serve it', [['Room temperature'], ['Warm and toasted']]),
      many('spread', 'Add a spread', 2, [['Butter', 15], ['Cheese spread', 20], ['Peanut butter', 20], ['Coco jam', 20]]),
      pairDrink];
    case 'pastry': return [
      one('flavor', 'Flavor', [['Classic'], ['Ube', 10], ['Cheese overload', 15]]),
      pick('warm', 'Serve it', [['Room temperature'], ['Warm']]),
      pairDrink];
    case 'coffee': return [
      one('size', 'Size', [['Small', 0, '12 oz'], ['Medium', 20, '16 oz'], ['Large', 35, '22 oz']]),
      one('temp', 'Hot or iced', art === 'iced' || art === 'ubedrink' ? [['Iced'], ['Hot']] : [['Hot'], ['Iced', 10]]),
      pick('milk', 'Milk', [['Fresh milk'], ['Oat milk', 30], ['Soy milk', 20], ['No milk']]),
      pick('sweet', 'Sweetness', [['Regular'], ['Less sweet'], ['Half sweet'], ['No sugar']]),
      many('extra', 'Extras', 3, [['Extra espresso shot', 35], ['Sea salt cream', 30], ['Vanilla syrup', 20]])];
    case 'grill': return [
      one('size', 'Serving', [['Regular'], ['Big serving', r5(price * 0.6), '50% more']]),
      meal('buko pandan'), drink,
      pick('rice', 'Add rice', [['No rice'], ['2 puso', 20], ['Garlic rice', 35]]),
      many('sauce', 'Sauces', 3, [['Spiced vinegar'], ['Toyomansi', 10], ['Sweet chili', 10], ['Atchara', 15]])];
    case 'grocery':
    case 'essential': return [
      one('pack', 'Quantity', [['Single'], ['Pack of 2', r5(price * 0.95), 'save 5%'], ['Pack of 4', r5(price * 2.8), 'save 10%']]),
      one('oos', 'If it’s out of stock', [['Replace with similar'], ['Message me first'], ['Remove it']])];
    default: return [];
  }
}

// [id, name, note, price, art, kind, section, tag?]
const item = ([id, name, note, price, art, kind, section, tag]) => ({
  id, name, note, price, section, image: null, art, ...(tag ? { tag } : {}), options: optionsFor(kind, price, art),
});
// [id, name, note, price, art]: fixed combos, added straight to the order
const bundle = ([id, name, note, price, art]) => ({ id, name, note, price, section: 'Bundles', bundle: true, image: null, art, options: [] });

export const SHOPS = [
  {
    id: 'lutong-bahay', name: 'Lutong Bahay Kitchen', sign: 'LUTONG BAHAY', category: 'food', area: 'Capitol Site',
    address: 'Escario St, Capitol Site, Cebu City', phone: '0917 555 0142',
    lng: 123.8930, lat: 10.3180, hours: '9:00 AM – 9:00 PM', opensAt: '09:00', closesAt: '21:00',
    color: '#E0782F', tint: '#FCE3CC', rating: 4.8, image: null,
    about: 'Home-style Filipino plates cooked in small batches through the day. The adobo simmers from 8 AM.',
    menu: [
      bundle(['barkada', 'Barkada Bundle', '2 adobo, pancit canton, lumpia, 4 rice, 4 iced tea. Feeds 4.', 520, 'noodle']),
      bundle(['solo', 'Solo Busog Meal', 'Adobo, rice, iced tea and leche flan.', 199, 'adobo']),
      item(['adobo', 'Chicken adobo + rice', 'Classic, slow-cooked', 120, 'adobo', 'dish', 'Mains', 'Best seller']),
      item(['sinigang', 'Pork sinigang', 'Good for 1–2', 150, 'soup', 'soup', 'Mains']),
      item(['lumpia', 'Lumpia (6 pcs)', 'Crispy pork and vegetable rolls', 85, 'lumpia', 'side', 'Sides']),
      item(['pancit', 'Pancit canton', 'Stir-fried egg noodles', 110, 'noodle', 'side', 'Sides']),
      item(['rice', 'Extra rice', 'One cup steamed rice', 20, 'rice', 'rice', 'Rice and extras']),
      item(['leche', 'Leche flan', 'Creamy caramel custard', 60, 'flan', 'dessert', 'Desserts']),
    ],
  },
  {
    id: 'kape-sugbo', name: 'Kape Sugbo', sign: 'KAPE SUGBO', category: 'coffee', area: 'Lahug',
    address: 'Salinas Dr, Lahug, Cebu City', phone: '0915 555 0176',
    lng: 123.8985, lat: 10.3290, hours: '7:00 AM – 10:00 PM', opensAt: '07:00', closesAt: '22:00',
    color: '#7E4E32', tint: '#EBDCCF', rating: 4.8, image: null,
    about: 'Cebu-roasted coffee and mango desserts, a short ride from IT Park.',
    menu: [
      bundle(['study', 'Study Buddy', '2 iced Spanish lattes and an ensaymada.', 310, 'iced']),
      bundle(['kape-mango', 'Kape and Mango', 'Barako brewed and a mango float cup.', 165, 'mango']),
      item(['spanish', 'Iced Spanish latte', 'Espresso and condensed milk', 140, 'iced', 'coffee', 'Coffee', 'Best seller']),
      item(['barako', 'Barako brewed', 'Strong Batangas-style brew', 90, 'coffee', 'coffee', 'Coffee']),
      item(['ube-latte', 'Ube latte', 'Purple yam and milk, no coffee', 150, 'ubedrink', 'coffee', 'Non-coffee']),
      item(['mango', 'Mango float cup', 'Cebu mangoes, graham, cream', 95, 'mango', 'dessert', 'Sweets']),
      item(['ensaymada', 'Ensaymada', 'Baked this morning', 60, 'ensaymada', 'pastry', 'Sweets']),
    ],
  },
  {
    id: 'panaderia-uno', name: 'Panaderia Uno', sign: 'PANADERIA UNO', category: 'bakery', area: 'Guadalupe',
    address: 'V. Rama Ave, Guadalupe, Cebu City', phone: '0918 555 0193',
    lng: 123.8805, lat: 10.3225, hours: '5:00 AM – 8:00 PM', opensAt: '05:00', closesAt: '20:00',
    color: '#C98A2E', tint: '#F7E6C4', rating: 4.7, image: null,
    about: 'A neighbourhood bakery. Pandesal comes out of the oven every two hours from 5 AM.',
    menu: [
      bundle(['merienda', 'Merienda Box', '6 ensaymada and 2 brewed coffees.', 230, 'ensaymada']),
      bundle(['breakfast', 'Breakfast Pack', '20 pandesal and 2 brewed coffees.', 180, 'pandesal']),
      item(['pandesal', 'Pandesal (10 pcs)', 'Baked every 2 hours', 50, 'pandesal', 'bread', 'Fresh bread', 'Best seller']),
      item(['spanish-bread', 'Spanish bread (6 pcs)', 'Sweet buttery filling', 60, 'spanish', 'bread', 'Fresh bread']),
      item(['ube', 'Ube cheese pandesal (6 pcs)', 'Purple yam with cheese', 90, 'ube', 'bread', 'Fresh bread', 'New']),
      item(['ensaymada', 'Ensaymada', 'Butter, sugar and cheese', 35, 'ensaymada', 'pastry', 'Pastries']),
      item(['brewed', 'Brewed coffee', 'Local barako blend', 45, 'coffee', 'coffee', 'Drinks']),
    ],
  },
  {
    id: 'tindahan-ni-aling-rosa', name: 'Tindahan ni Aling Rosa', sign: 'ALING ROSA', category: 'grocery', area: 'Sambag II',
    address: 'Urgello St, Sambag II, Cebu City', phone: '0927 555 0117',
    lng: 123.8890, lat: 10.3075, hours: '6:00 AM – 10:00 PM', opensAt: '06:00', closesAt: '22:00',
    color: '#4E9A4A', tint: '#DCEFD3', rating: 4.9, image: null,
    about: 'The sari-sari store everyone on the street knows. Pantry basics, canned goods and coffee.',
    menu: [
      bundle(['almusal', 'Almusal Pack', 'Eggs, 2 sardines and 3-in-1 coffee.', 165, 'eggs']),
      bundle(['restock', 'Pantry Restock', '1 kg rice, cooking oil, 3 noodle packs and eggs.', 210, 'sack']),
      item(['eggs', 'Eggs (half dozen)', 'Medium, farm fresh', 54, 'eggs', 'grocery', 'Pantry']),
      item(['rice1', 'Rice (1 kg)', 'Well-milled', 58, 'sack', 'grocery', 'Pantry']),
      item(['oil', 'Cooking oil (500 ml)', 'Palm olein', 65, 'bottle', 'grocery', 'Pantry']),
      item(['noodles', 'Instant noodles (3 packs)', 'Assorted flavours', 45, 'pack', 'grocery', 'Pantry']),
      item(['sardines', 'Sardines in tomato sauce', '155 g can', 24, 'can', 'grocery', 'Canned goods']),
      item(['coffee3', '3-in-1 coffee (10 sachets)', 'Original blend', 75, 'sachet2', 'grocery', 'Drinks']),
    ],
  },
  {
    id: 'bayanihan-essentials', name: 'Bayanihan Essentials', sign: 'BAYANIHAN', category: 'essentials', area: 'Kamputhaw',
    address: 'Gorordo Ave, Kamputhaw, Cebu City', phone: '0919 555 0128',
    lng: 123.8950, lat: 10.3120, hours: '8:00 AM – 9:00 PM', opensAt: '08:00', closesAt: '21:00',
    color: '#3E86C9', tint: '#D6E7F6', rating: 4.6, image: null,
    about: 'Household and personal care at sari-sari prices, packed and ready for the rider.',
    menu: [
      bundle(['bath-kit', 'Bath Kit', 'Soap, shampoo sachets and toothpaste.', 220, 'soap']),
      bundle(['laundry-day', 'Laundry Day', 'Laundry powder and 12 fabric conditioner sachets.', 185, 'box']),
      item(['soap', 'Bath soap (3 bars)', 'Moisturising', 75, 'soap', 'essential', 'Personal care']),
      item(['shampoo', 'Shampoo sachets (12)', 'Assorted', 72, 'sachet', 'essential', 'Personal care']),
      item(['toothpaste', 'Toothpaste (150 g)', 'Fluoride, mint', 95, 'tube', 'essential', 'Personal care']),
      item(['detergent', 'Laundry powder (1 kg)', 'With fabric softener', 110, 'box', 'essential', 'Home']),
      item(['alcohol', 'Isopropyl alcohol (500 ml)', '70% solution', 85, 'bottle2', 'essential', 'Home']),
    ],
  },
  {
    id: 'sugbo-grill', name: 'Sugbo Grill House', sign: 'SUGBO GRILL', category: 'food', area: 'Mabolo',
    address: 'Pope John Paul II Ave, Mabolo, Cebu City', phone: '0916 555 0164',
    lng: 123.9120, lat: 10.3215, hours: '11:00 AM – 11:00 PM', opensAt: '11:00', closesAt: '23:00',
    color: '#C9432F', tint: '#F6D5CC', rating: 4.7, image: null,
    about: 'Charcoal-grilled Cebu favourites with puso on the side, open late.',
    menu: [
      bundle(['platter', 'Grill Platter', 'Inasal, liempo, 6 BBQ sticks, 8 puso. Feeds 4.', 650, 'bbq']),
      bundle(['inasal-duo', 'Inasal Duo', '2 chicken inasal, 2 rice, 2 iced tea.', 320, 'inasal']),
      item(['inasal', 'Chicken inasal + rice', 'Annatto-basted, with garlic oil', 165, 'inasal', 'grill', 'Grill', 'Best seller']),
      item(['bbq', 'Pork BBQ (3 sticks)', 'Sweet soy glaze', 120, 'bbq', 'grill', 'Grill']),
      item(['liempo', 'Grilled liempo', 'Pork belly, vinegar dip', 180, 'liempo', 'grill', 'Grill']),
      item(['squid', 'Grilled squid', 'Stuffed with tomato and onion', 220, 'squid', 'grill', 'Grill']),
      item(['puso', 'Puso (hanging rice)', 'Rice in woven coconut leaf', 20, 'puso', 'puso', 'Rice']),
    ],
  },
];
