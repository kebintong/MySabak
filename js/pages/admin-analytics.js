/* Admin analytics (pages/admin-analytics.html): this week's numbers, growth, trips per day by service, tips,
   payments, the new-driver funnel and how each area is doing. One measure per chart; services keep fixed colours. */
import { adminAnalytics, errorMessage } from '../api.js';
import { $, $$, esc, icon, toast, rollNumber, smoothPath, STAR_SVG } from '../ui.js';
import { mountAdmin, SERVICES, minSec, num, tag, wireTips, wirePoints } from './admin-common.js';

const HEALTH = {
  good: { chip: 'approved', label: 'Healthy', why: 'Pickups under 4 minutes and few cancellations' },
  warning: { chip: 'review', label: 'Long waits', why: 'Pickups over 4 minutes: more drivers would help' },
  critical: { chip: 'fix', label: 'Short on drivers', why: 'Pickups over 6 minutes or many cancellations' },
};
// What each of this week's numbers means (shown on hover / tap)
const KPI_HELP = {
  Trips: 'Rides, Express, Moto and Shop orders finished in the last 7 days',
  'Tips to mysabak': 'What riders chose to give mysabak this week',
  'Riders active': 'Riders who took at least one trip this week',
  'Drivers active': 'Drivers who finished at least one trip this week',
  'Average pickup': 'From booking to the driver arriving',
  Cancelled: 'Bookings cancelled by the rider or driver',
};
const SVC_ICON = { ride: 'i-car', express: 'i-box', moto: 'i-motor', shop: 'i-bag' };
/** "Oct 6" for `back` days before today. */
const dayName = (back) => (back === 0 ? 'Today' : new Date(Date.now() - back * 86400e3).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }));

mountAdmin().then((user) => {
  if (!user) return;
  $('#statsPage').hidden = false;
  wireTips($('#statsPage'));
  adminAnalytics().then(render).catch((err) => toast(errorMessage(err)));
});

/** A line through `vals` in a w×h box (with a little room top and bottom), and the area under it. */
function line(vals, w, h, lo = Math.min(...vals), hi = Math.max(...vals)) {
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 12)]);
  const d = smoothPath(pts);
  return { line: d, area: `${d} L${w - 2},${h} L2,${h} Z`, last: pts[pts.length - 1], pts };
}

/* One purple line over a fill that fades from the line down to clear (css/base.css --chart), a gold star at today */
const aurora = (id, w, g) => `<defs><linearGradient id="${id}F" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b5cd6" stop-opacity=".32"/><stop offset="1" stop-color="#8b5cd6" stop-opacity="0"/></linearGradient></defs>
  <path class="aarea" d="${g.area}" fill="url(#${id}F)"/><path class="aline" d="${g.line}"/>`;
const nowStar = (g, w, h) => `<span class="anow" aria-hidden="true" style="left:${((g.last[0] / w) * 100).toFixed(2)}%;top:${((g.last[1] / h) * 100).toFixed(2)}%"><i></i>${STAR_SVG}</span>`;

function render(a) {
  const w = a.week;
  const kpi = (l, v, d, bad) => `<div class="kpi6" tabindex="0" data-tip="${esc(`${l}: ${v}|${KPI_HELP[l]}|${d} on the 7 days before`)}">
    <span class="stat-l">${l}</span><b class="kpi6__v">${v}</b><span class="kpi6__d${bad ? ' kpi6__d--bad' : ''}">${d}</span></div>`;
  $('#kpis').innerHTML = kpi('Trips', num(w.trips), w.tripsChange) + kpi('Tips to mysabak', `₱${num(w.tips)}`, w.tipsChange)
    + kpi('Riders active', num(w.ridersActive), w.ridersChange) + kpi('Drivers active', num(w.driversActive), w.driversChange)
    + kpi('Average pickup', minSec(w.avgPickupSec), w.pickupChange) + kpi('Cancelled', `${w.cancelledPct}%`, w.cancelledChange, true);

  // Small multiples: each group on its own scale
  const groups = [['Riders registered', a.growth.riders], ['Drivers approved', a.growth.drivers], ['Shops', a.growth.shops]];
  $('#growth').innerHTML = groups.map(([label, vals], gi) => {
    const g = line(vals, 300, 64);
    const delta = vals[vals.length - 1] - vals[0];
    const says = `${label}: ${num(vals[0])} 30 days ago, ${num(vals[vals.length - 1])} now. Use the arrow keys to read each day.`;
    return `<div class="multi"><span class="multi__l">${label}</span><b class="multi__v">${num(vals[vals.length - 1])}</b>
      <span class="multi__d">${delta >= 0 ? '▲' : '▼'} ${num(Math.abs(delta))} in 30 days</span>
      <div class="pointable" aria-label="${esc(says)}"><svg class="spark" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
        ${aurora(`grow${gi}`, 300, g)}</svg>${nowStar(g, 300, 64)}</div></div>`;
  }).join('');
  [...$('#growth').querySelectorAll('.pointable')].forEach((host, gi) => {
    const [label, vals] = groups[gi];
    const g = line(vals, 300, 64);
    wirePoints(host, vals.length, (i) => {
      const back = vals.length - 1 - i;
      const d = i ? vals[i] - vals[i - 1] : 0;
      return { lines: [num(vals[i]), `${label} · ${dayName(back)}`, i ? `${d >= 0 ? '+' : ''}${num(d)} on the day before` : 'First day shown'],
        x: g.pts[i][0] / 300, y: g.pts[i][1] / 64 };
    });
  });

  // Trips per day, stacked by service in a fixed order
  const totals = a.tripsPerDay.map((d) => SERVICES.reduce((s, x) => s + d[x.id], 0));
  const max = Math.max(...totals);
  $('#tripsTotal').textContent = `${num(totals.reduce((s, x) => s + x, 0))} this week`;
  // One aurora bar a day (the total); point at or tap one to split it by service underneath
  const days = a.tripsPerDay;
  const lastDay = days.length - 1;
  // the real weekday of each bar (the sample data's own day names don't follow the calendar)
  const weekday = (i, form) => new Date(Date.now() - (lastDay - i) * 86400e3).toLocaleDateString('en-PH', { weekday: form });
  const longDay = (i) => (i === lastDay ? 'Today so far' : weekday(i, 'long'));
  const shortDay = (i) => (i === lastDay ? 'Today' : weekday(i, 'short'));
  $('#trips').innerHTML = days.map((d, i) => `<button type="button" class="tbar${i === lastDay ? ' is-today' : ''}" data-i="${i}" style="--i:${i};--h:${Math.round((totals[i] / max) * 100)}%" aria-label="${esc(longDay(i))}: ${num(totals[i])} trips" aria-pressed="false">
    <span class="tbar__plot"><span class="tbar__fill"></span></span><span class="tbar__d">${esc(shortDay(i))}</span></button>`).join('');
  let pickedDay = -1;
  const pickDay = (i) => {
    if (i === pickedDay) return;
    pickedDay = i;
    [...$('#trips').children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const was = $$('#tripSplit b').map((b) => b.dataset.value ?? null);
    $('#tripSplit').innerHTML = `<div class="tsplit__top"><span>${esc(longDay(i))}</span><b>${num(totals[i])} trips</b></div>
      <div class="tsplit__grid">${SERVICES.map((s) => `<div style="--c:${s.color}"><span>${icon(SVC_ICON[s.id])}${s.name}</span><b>${num(days[i][s.id])}</b></div>`).join('')}</div>`;
    $$('#tripSplit b').forEach((b, k) => rollNumber(b, was[k] ?? null));
  };
  const barAt = (e) => e.target.closest('[data-i]');
  $('#trips').addEventListener('click', (e) => { if (barAt(e)) pickDay(Number(barAt(e).dataset.i)); });
  $('#trips').addEventListener('focusin', (e) => { if (barAt(e)) pickDay(Number(barAt(e).dataset.i)); });
  $('#trips').addEventListener('pointerover', (e) => { if (barAt(e) && e.pointerType === 'mouse') pickDay(Number(barAt(e).dataset.i)); });
  pickDay(lastDay);
  $('#tripsTable').innerHTML = `<thead><tr><th>Day</th>${SERVICES.map((s) => `<th class="num">${s.name}</th>`).join('')}<th class="num">Total</th></tr></thead>
    <tbody>${a.tripsPerDay.map((d, i) => `<tr><td>${esc(shortDay(i))}</td>${SERVICES.map((s) => `<td class="num">${num(d[s.id])}</td>`).join('')}<td class="num"><b>${num(totals[i])}</b></td></tr>`).join('')}</tbody>`;

  // Tips per day: one line on a fixed ₱0–₱10,000 scale
  const tips = a.tipsPerDay;
  const t = line(tips, 600, 220, 0, 10000);
  const today = tips[tips.length - 1];
  $('#tips30').textContent = `₱${num(tips.reduce((s, x) => s + x, 0))} in 30 days`;
  $('#tipsToday').textContent = `Today ₱${num(today)}`;
  $('#tipsFrom').textContent = dayName(tips.length - 1);
  const gy = (v) => (216 - (v / 10000) * 208).toFixed(1);
  $('#tipsLine').innerHTML = `<line x1="0" y1="${gy(0)}" x2="600" y2="${gy(0)}" stroke="#eee4ec"/>
    <line x1="0" y1="${gy(4000)}" x2="600" y2="${gy(4000)}" stroke="#f4eef7"/><line x1="0" y1="${gy(8000)}" x2="600" y2="${gy(8000)}" stroke="#f4eef7"/>
    ${aurora('tips', 600, t)}`;
  // gridline labels sit in HTML over the chart (text inside a stretched SVG would stretch too)
  $('#tipsWrap').querySelectorAll('.ylab').forEach((x) => x.remove());
  $('#tipsWrap').insertAdjacentHTML('beforeend', [4000, 8000].map((v) => `<span class="ylab" aria-hidden="true" style="top:${(gy(v) / 220) * 100}%">₱${num(v)}</span>`).join('') + nowStar(t, 600, 220));
  const avg = Math.round(tips.reduce((s, x) => s + x, 0) / tips.length);
  wirePoints($('#tipsWrap'), tips.length, (i) => ({
    lines: [`₱${num(tips[i])}`, i === tips.length - 1 ? 'Today so far' : dayName(tips.length - 1 - i),
      `${tips[i] >= avg ? '▲' : '▼'} ₱${num(Math.abs(tips[i] - avg))} ${tips[i] >= avg ? 'above' : 'below'} the 30-day average`],
    x: t.pts[i][0] / 600, y: t.pts[i][1] / 220,
  }));

  // How riders pay: a donut with the biggest share in the middle
  const R = 58;
  const RING = 2 * Math.PI * R;
  const PAY_COLOURS = ['#8b5cd6', '#cdb6f2', '#eba93a'];
  const payTip = (p) => esc(`${p.share}%|${p.name}|About ${num(Math.round((w.trips * p.share) / 100))} trips this week`);
  let along = 0;
  const arcs = a.payments.map((p, i) => {
    const len = (p.share / 100) * RING;
    const arc = `<circle class="parc" style="--ring:${RING.toFixed(1)};--i:${i}" cx="80" cy="80" r="${R}" stroke="${PAY_COLOURS[i % 3]}" stroke-dasharray="${Math.max(0, len - 3).toFixed(1)} ${(RING - len + 3).toFixed(1)}" stroke-dashoffset="${(-along).toFixed(1)}" transform="rotate(-90 80 80)" data-tip="${payTip(p)}"></circle>`;
    along += len;
    return arc;
  }).join('');
  const top = a.payments.reduce((x, y) => (y.share > x.share ? y : x));
  $('#payments').innerHTML = `<div class="pdonut__ring"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(a.payments.map((p) => `${p.name} ${p.share}%`).join(', '))}">${arcs}</svg>
      <div class="pdonut__mid"><b>${top.share}%</b><span>${esc(top.name)}</span></div></div>
    <ul class="pdonut__list">${a.payments.map((p, i) => `<li tabindex="0" data-tip="${payTip(p)}"><i style="--c:${PAY_COLOURS[i % 3]}"></i><span>${esc(p.name)}</span><b>${p.share}%</b></li>`).join('')}</ul>`;

  // New drivers: each step as an aurora bar with its number inside; the last step, a first trip, in gold
  const first = a.driverFunnel[0].count || 1;
  $('#funnel').innerHTML = a.driverFunnel.map((f, i) => `<div class="fbar${i === a.driverFunnel.length - 1 ? ' is-last' : ''}" tabindex="0" style="--w:${(f.count / first) * 100}%;--i:${i}" data-tip="${esc(`${num(f.count)}|${f.name} · ${Math.round((f.count / first) * 100)}% of those who applied${i ? `|${num(a.driverFunnel[i - 1].count - f.count)} dropped off after “${a.driverFunnel[i - 1].name}”` : ''}`)}">
    <span class="fbar__fill"></span><span class="fbar__txt"><span>${esc(f.name)}</span><b>${num(f.count)}</b></span></div>`).join('');
  const drops = a.driverFunnel.slice(1).map((f, i) => ({ name: f.name, lost: a.driverFunnel[i].count - f.count }));
  const worst = drops.reduce((x, y) => (y.lost > x.lost ? y : x));
  $('#funnelNote').innerHTML = `Most drop off at <b>${esc(worst.name)}</b> (−${num(worst.lost)}).`;

  $('#areas').innerHTML = `<thead><tr><th>Area</th><th class="num">Trips</th><th class="num">Avg pickup</th><th class="num">Cancelled</th><th class="area__status">Status</th></tr></thead>
    <tbody>${a.areas.map((r, i) => {
      const h = HEALTH[r.health] || HEALTH.good;
      return `<tr style="--i:${i}"><td class="area__name">${esc(r.name)}</td><td class="num" data-l="Trips">${num(r.trips)}</td><td class="num" data-l="Avg pickup">${minSec(r.avgPickupSec)}</td><td class="num" data-l="Cancelled">${r.cancelledPct}%</td>
        <td class="area__status"><span tabindex="0" data-tip="${esc(`${h.label}|${h.why}`)}">${tag(h.chip, h.label)}</span></td></tr>`;
    }).join('')}</tbody>`;
  $$('.kpi6__v, .multi__v').forEach((b) => rollNumber(b));
}
