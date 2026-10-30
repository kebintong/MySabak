// Made-up shops for the tests only (they replace the demo's sample shops while the tests run).
const one = (id, name, choices, more = {}) => ({ id, name, type: 'one', required: true, choices, ...more });

export const TEST_SHOP = {
  id: 'test-kitchen', name: 'Test Kitchen', category: 'food', area: 'Capitol Site',
  address: 'Escario St, Cebu City', lng: 123.8930, lat: 10.3180, hours: '9:00 AM – 9:00 PM', opensAt: '09:00', closesAt: '21:00',
  color: '#E0782F', image: null,
  menu: [
    { id: 'combo', name: 'Barkada Bundle', price: 520, section: 'Bundles', bundle: true, image: null, options: [] },
    {
      id: 'adobo', name: 'Chicken adobo + rice', price: 120, section: 'Mains', image: null, options: [
        one('size', 'Size', [{ name: 'Solo', price: 0 }, { name: 'Sharing', price: 110 }, { name: 'Family', price: 260 }]),
        one('meal', 'Make it a meal', [{ name: 'Ala carte', price: 0 }, { name: 'Meal', price: 45 }]),
        one('drink', 'Choose your drink', [{ name: 'Iced tea', price: 0 }, { name: 'Cola', price: 0 }, { name: 'Fresh buko juice', price: 30 }],
          { showIf: { group: 'meal', notIn: ['Ala carte'] } }),
        one('rice', 'Rice', [{ name: 'Plain rice', price: 0 }, { name: 'Garlic rice', price: 15 }]),
        { id: 'add', name: 'Add-ons', type: 'many', required: false, max: 3, choices: [
          { name: 'Fried egg', price: 20 }, { name: 'Extra sauce', price: 10 }, { name: 'Atchara', price: 15 }, { name: 'Chicharon', price: 25 }] },
      ],
    },
  ],
};

export const TEST_SHOP_2 = { ...TEST_SHOP, id: 'test-grill', name: 'Test Grill', lng: 123.9120, lat: 10.3215, menu: [] };
