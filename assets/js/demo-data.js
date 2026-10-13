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
