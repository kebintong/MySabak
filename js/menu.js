/* =========================================================
   mysabak · menu item options and shop hours (pure functions, no browser APIs)
   Used by the shop screens, the cart and api.js. Tested in tests/menu.test.mjs.

   An item can have option groups (see PANELS.md → Shop):
     { id, name, type: 'one' | 'many', required?, max?, choices: [{ name, price, hint? }],
       showIf?: { group, notIn: [choice names] } }
   "picks" are the customer's choices: { [groupId]: 'Choice name' | ['Choice', …] }.
   ========================================================= */

const groupsOf = (item) => (item && Array.isArray(item.options) ? item.options : []);

/** Groups that apply with these picks (e.g. "Choose your drink" only once a meal is picked). */
export function visibleGroups(item, picks = {}) {
  return groupsOf(item).filter((g) => !g.showIf || !g.showIf.notIn.includes(picks[g.showIf.group]));
}

/** First choice of every single-choice group, nothing in multi-choice groups. */
export function defaultPicks(item) {
  const picks = {};
  groupsOf(item).forEach((g) => { picks[g.id] = g.type === 'many' ? [] : g.choices[0].name; });
  return picks;
}

/**
 * Picks checked against the menu: unknown choices dropped, single-choice groups fall back to
 * their first choice, multi-choice groups capped at `max`, hidden groups left out.
 * The server must do the same before pricing an order.
 */
export function cleanPicks(item, picks = {}) {
  const base = { ...defaultPicks(item), ...(picks && typeof picks === 'object' ? picks : {}) };
  const out = {};
  visibleGroups(item, base).forEach((g) => {
    const names = g.choices.map((c) => c.name);
    if (g.type === 'many') {
      const list = Array.isArray(base[g.id]) ? base[g.id] : [];
      out[g.id] = [...new Set(list)].filter((n) => names.includes(n)).slice(0, g.max || names.length);
    } else {
      out[g.id] = names.includes(base[g.id]) ? base[g.id] : names[0];
    }
  });
  return out;
}

/** One item's price with these picks: base price + every picked choice. */
export function unitPrice(item, picks = {}) {
  const clean = cleanPicks(item, picks);
  let total = item.price;
  visibleGroups(item, clean).forEach((g) => {
    [].concat(clean[g.id] || []).forEach((n) => {
      const c = g.choices.find((x) => x.name === n);
      if (c && c.price) total += c.price;
    });
  });
  return total;
}

/** Short words for the picks, for cart lines and receipts. Leaves out untouched defaults. */
export function pickLabels(item, picks = {}) {
  const clean = cleanPicks(item, picks);
  const out = [];
  visibleGroups(item, clean).forEach((g) => {
    if (g.type === 'many') out.push(...clean[g.id]);
    else if (clean[g.id] !== g.choices[0].name || g.showIf) out.push(clean[g.id]);
  });
  return out;
}

/** Same item + same picks + same note → same cart line. */
export function lineKey(itemId, picks = {}, note = '') {
  const sorted = Object.keys(picks).sort().map((k) => [k, [].concat(picks[k]).sort()]);
  return `${itemId}|${JSON.stringify(sorted)}|${String(note).trim()}`;
}

/* ---------- Shop hours ---------- */

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
const label = (hhmm) => {
  const t = minutesOf(hhmm);
  const h = Math.floor(t / 60) % 24;
  const m = t % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Minutes past midnight in Cebu (Asia/Manila), whatever the device's time zone. */
export function cebuMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return (get('hour') % 24) * 60 + get('minute');
}

/**
 * Is the shop open now? Needs `opensAt` / `closesAt` ("HH:MM", Cebu time).
 * @returns {{open:boolean, text:string} | null}  null when the hours aren't known
 */
export function openState(shop, date = new Date()) {
  if (!shop || !shop.opensAt || !shop.closesAt) return null;
  const now = cebuMinutes(date);
  const from = minutesOf(shop.opensAt);
  const to = minutesOf(shop.closesAt);
  const open = from <= to ? now >= from && now < to : now >= from || now < to; // closesAt past midnight
  return { open, text: open ? `Open · closes ${label(shop.closesAt)}` : `Closed · opens ${label(shop.opensAt)}` };
}
