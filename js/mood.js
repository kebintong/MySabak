/* The merchant dashboard's mood board: how the shop is doing today, in one friendly line.
   Today's sales are compared with the shop's usual day, scaled to how much of today's opening hours has passed:
   20% or more ahead is busy, 20% or more behind is slow, anything between is steady. */

const MESSAGES = {
  busy: [
    ['🎉', (n) => `Your shop received ${n} orders today!`, 'Keep it up! You’re ahead of your usual pace.'],
    ['🔥', (n) => `${n} orders and counting!`, 'You’re busier than usual. Great work!'],
    ['🚀', () => 'Orders are flying in today!', 'Well ahead of your usual pace. Keep the kitchen rolling!'],
  ],
  steady: [
    ['☀️', () => 'A steady day so far', 'Right on your usual pace. Nice and calm.'],
    ['👍', (n) => `${n} orders, right on track`, 'Sales are where they usually are at this hour.'],
  ],
  slow: [
    ['🌶️', () => 'You’re running low on sales', 'You might want to spice things up! Try a promo or a new dish.'],
    ['🍳', () => 'A quiet day so far', 'Check that your best-sellers aren’t marked sold out, and that your photos look tasty.'],
    ['📣', () => 'Sales are slower than usual', 'Let your regulars know you’re open today!'],
  ],
  early: [['☕', () => 'Just opened', 'Orders usually pick up as the day goes on.']],
  closed: [['🌙', () => 'Not taking orders', 'Turn on Accepting orders when you’re ready for customers.']],
  after: [['🌙', () => 'Outside opening hours', 'Rest up. Customers can order again when you open.']],
  new: [['🌱', (n) => (n ? `${n} order${n === 1 ? '' : 's'} so far` : 'Waiting for your first order'), 'This branch is new. Its mood shows once it has a few days of sales.']],
};

const minutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * @param {{open:boolean, orders:number, sales:number, usual:number, opensAt:string, closesAt:string, now?:Date}} day
 *   usual: the shop's usual sales for a whole day (0 = no history yet)
 * @returns {{kind:'busy'|'steady'|'slow'|'early'|'closed'|'after'|'new', emoji:string, title:string, text:string}}
 */
export function moodFor({ open, orders, sales, usual, opensAt, closesAt, now = new Date() }) {
  const at = now.getHours() * 60 + now.getMinutes();
  const start = minutes(opensAt);
  const end = minutes(closesAt);
  let kind;
  if (!open) kind = 'closed';
  else if (at < start || at >= end) kind = 'after';
  else if (!usual) kind = 'new';
  else {
    const done = (at - start) / (end - start);
    if (done < 0.15) kind = 'early';
    else {
      const pace = sales / (usual * done);
      kind = pace >= 1.2 ? 'busy' : pace <= 0.8 ? 'slow' : 'steady';
    }
  }
  const list = MESSAGES[kind];
  const [emoji, title, text] = list[now.getDate() % list.length]; // a different line on different days
  return { kind, emoji, title: title(orders), text };
}
