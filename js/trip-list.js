/* The driver's trips as rows grouped by day, each day with its total: the Drive page's latest trips and the Trips page. */
import { esc, peso, icon } from './ui.js';

export const TRIP_KIND = { ride: ['Ride', 'i-car'], express: ['Express', 'i-box'], shop: ['Shop delivery', 'i-bag'] };

const dayKey = (ts) => new Date(ts).toDateString();
const time = (ts) => new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
function dayName(ts) {
  const d = new Date(ts);
  const t = new Date();
  if (dayKey(d) === dayKey(t)) return 'Today';
  t.setDate(t.getDate() - 1);
  if (dayKey(d) === dayKey(t)) return `Yesterday · ${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

const row = (t) => {
  const [name, ic] = TRIP_KIND[t.kind] || [t.kind, 'i-car'];
  return `<li class="trow"><span class="trow__ic">${icon(ic)}</span>
    <span class="trow__main"><b>${esc(name)} <span>· ${t.distanceKm.toFixed(1)} km</span></b><span>${time(t.at)}</span></span>
    <b class="trow__fare">${peso(t.fare)}</b></li>`;
};

/** `trips` grouped by day, newest first. Day totals count every trip in `all` (so a day split across pages shows its whole total). */
export function tripsByDay(trips, all = trips) {
  const totals = new Map();
  all.forEach((t) => totals.set(dayKey(t.at), (totals.get(dayKey(t.at)) || 0) + t.fare));
  const days = new Map();
  trips.forEach((t) => days.set(dayKey(t.at), [...(days.get(dayKey(t.at)) || []), t]));
  return [...days].map(([k, list]) => `<li class="tday"><p class="tday__head"><span>${esc(dayName(list[0].at))}</span><span>${peso(totals.get(k))}</span></p>
    <ul class="tday__list">${list.map(row).join('')}</ul></li>`).join('');
}
