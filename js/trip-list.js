/* The driver's trips as rows grouped by day, each day with its total (the Trips page, and today's trips on Earnings).
   Each row opens the trip's details in a sheet. Jobs that ended early (cancelled, no-show, not delivered) show their
   status instead of a fare. */
import { esc, peso, icon, sheet } from './ui.js';

export const TRIP_KIND = { ride: ['Ride', 'i-car'], express: ['Parcel', 'i-box'], shop: ['Food', 'i-bag'] }; // the same names as the Drive page
// Why a job ended early: picked by the driver on the Drive page, shown again in the trip's details
export const CANCEL_REASONS = [['rider_asked', 'The rider asked me to cancel'], ['too_far', 'The pickup is too far or in the wrong place'], ['vehicle', 'A problem with my vehicle'], ['safety', 'I don’t feel safe'], ['other', 'Something else']];
export const FAIL_REASONS = [['recipient_unavailable', 'The recipient isn’t there'], ['wrong_address', 'The address is wrong'], ['refused', 'The recipient refused it']];
const REASON = Object.fromEntries([...CANCEL_REASONS, ...FAIL_REASONS, ['no_show', 'Nobody came to the pickup']]);
const OUTCOME = { cancelled: 'Cancelled', no_show: 'No-show', failed: 'Not delivered' };
const PAY = { cash: 'Cash', gcash: 'GCash', bank: 'Online banking' };

const dayKey = (ts) => new Date(ts).toDateString();
// Formatters built once: toLocaleString() makes a new one on every call, which was slow in long lists and charts
const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });
const MONTH_DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });
const WEEK_DAY = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const FULL = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (ts) => TIME.format(new Date(ts));
function dayName(ts) {
  const d = new Date(ts);
  const t = new Date();
  if (dayKey(d) === dayKey(t)) return 'Today';
  t.setDate(t.getDate() - 1);
  if (dayKey(d) === dayKey(t)) return `Yesterday · ${MONTH_DAY.format(d)}`;
  return WEEK_DAY.format(d);
}

// What each row shows: the classic line icon of its kind, in the row's ink
const RIDE_ICON = { motor: 'i-motor', sedan: 'i-car', suv: 'i-suv' };
const art = (t) => icon(t.kind === 'ride' ? RIDE_ICON[t.vehicle] || 'i-car' : (TRIP_KIND[t.kind] || TRIP_KIND.ride)[1]);
const nameOf = (t) => (TRIP_KIND[t.kind] || [t.kind])[0];
const earned = (t) => (t.outcome ? 0 : t.fare); // a job that ended early has no fare
const row = (t) => {
  const name = nameOf(t);
  const route = t.from ? `${t.from} → ${t.to}` : ''; // older trips kept no route
  const status = t.outcome ? OUTCOME[t.outcome] || 'Ended early' : '';
  const sub = [route ? name : '', t.outcome ? '' : `${t.distanceKm.toFixed(1)} km`, time(t.at)].filter(Boolean).join(' · ');
  return `<li class="trow${t.outcome ? ' trow--ended' : ''}">
    <button type="button" class="trow__open" data-trip="${esc(t.id)}" aria-label="${esc([name, route, time(t.at), status || peso(t.fare)].filter(Boolean).join(', '))}. Details"></button>
    <span class="trow__ic">${art(t)}</span>
    <span class="trow__main"><b>${esc(route || name)}</b><span>${esc(sub)}</span></span>
    ${status ? `<span class="trow__status">${esc(status)}</span>` : `<b class="trow__fare">${peso(t.fare)}</b>`}</li>`;
};

/** `trips` grouped by day, newest first. Day totals count every trip in `all` (so a day split across pages shows its whole total). */
export function tripsByDay(trips, all = trips) {
  const totals = new Map();
  all.forEach((t) => totals.set(dayKey(t.at), (totals.get(dayKey(t.at)) || 0) + earned(t)));
  const days = new Map();
  trips.forEach((t) => days.set(dayKey(t.at), [...(days.get(dayKey(t.at)) || []), t]));
  return [...days].map(([k, list]) => `<li class="tday"><p class="tday__head"><span>${esc(dayName(list[0].at))}</span><span>${peso(totals.get(k))}</span></p>
    <ul class="tday__list">${list.map(row).join('')}</ul></li>`).join('');
}

/** One trip's details in a sheet: when, the route, the money (fare, platform fee, after the fee) or why it ended early. */
export function tripSheet(t) {
  const dl = (rows) => `<dl class="dglance__rows">${rows.map(([k, v, cls = '']) => `<div${cls ? ` class="${cls}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const route = t.from
    ? `<ol class="rq__route tsheet__route"><li><span class="sr-only">Pickup: </span>${esc(t.from)}</li><li><span class="sr-only">Drop-off: </span>${esc(t.to)}</li></ol>`
    : '<p class="sheet__sub">The route wasn’t saved for this trip.</p>';
  const facts = dl([
    ['When', esc(FULL.format(t.at))],
    ...(t.distanceKm ? [['Distance', `${t.distanceKm.toFixed(1)} km`]] : []),
    ['Payment', esc(PAY[t.payment] || 'Not recorded')],
    ['Booking', `<span class="tsheet__ref">${esc(t.id)}</span>`],
  ]);
  const money = t.outcome
    ? dl([['Why it ended', esc(REASON[t.reason] || 'Not recorded')], ['Fare', peso(0)], ['Platform fee', `${peso(0)}<span class="tsheet__note">None for a job that ended early</span>`]])
    : dl([['Fare', peso(t.fare)], ['Platform fee', `−${peso(t.fee || 0)}`, 'tsheet__fee'], ['After the fee', peso(t.fare - (t.fee || 0)), 'dglance__net']]);
  return sheet(`${esc(nameOf(t))} · ${esc(t.outcome ? OUTCOME[t.outcome] || 'Ended early' : 'Completed')}`,
    `${route}${facts}<h3 class="dglance__sub">${t.outcome ? 'What happened' : 'Money'}</h3>${money}
    <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Close</button></div>`);
}
