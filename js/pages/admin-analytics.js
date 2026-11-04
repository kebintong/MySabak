/* Admin analytics (pages/admin-analytics.html): this week's numbers, growth, trips per day by service, tips,
   payments, the new-driver funnel and how each area is doing. One measure per chart; services keep fixed colours. */
import { adminAnalytics, errorMessage } from '../api.js';
import { $, esc, toast } from '../ui.js';
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
  const d = pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  return { line: `M ${d}`, area: `M 2 ${h} L ${d} L ${w - 2} ${h} Z`, last: pts[pts.length - 1], pts };
}

function render(a) {
  $('#sampleChip').hidden = !a.sample;
  const w = a.week;
  const kpi = (l, v, d, bad) => `<div class="kpi6" tabindex="0" data-tip="${esc(`${l}: ${v}|${KPI_HELP[l]}|${d} on the 7 days before`)}">
    <span class="stat-l">${l}</span><span class="kpi6__v">${v}</span><span class="kpi6__d${bad ? ' kpi6__d--bad' : ''}">${d}</span></div>`;
  $('#kpis').innerHTML = kpi('Trips', num(w.trips), w.tripsChange) + kpi('Tips to mysabak', `₱${num(w.tips)}`, w.tipsChange)
    + kpi('Riders active', num(w.ridersActive), w.ridersChange) + kpi('Drivers active', num(w.driversActive), w.driversChange)
    + kpi('Average pickup', minSec(w.avgPickupSec), w.pickupChange) + kpi('Cancelled', `${w.cancelledPct}%`, w.cancelledChange, true);

  // Small multiples: each group on its own scale
  const groups = [['Riders registered', a.growth.riders], ['Drivers approved', a.growth.drivers], ['Shops', a.growth.shops]];
  $('#growth').innerHTML = groups.map(([label, vals]) => {
    const g = line(vals, 300, 64);
    const delta = vals[vals.length - 1] - vals[0];
    const says = `${label}: ${num(vals[0])} 30 days ago, ${num(vals[vals.length - 1])} now. Use the arrow keys to read each day.`;
    return `<div class="multi"><span class="multi__l">${label}</span><span class="multi__v">${num(vals[vals.length - 1])}</span>
      <span class="multi__d">${delta >= 0 ? '▲' : '▼'} ${num(Math.abs(delta))} in 30 days</span>
      <div class="pointable" aria-label="${esc(says)}"><svg class="spark" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
        <path d="${g.area}" fill="#6e30b4" fill-opacity=".1"/><path d="${g.line}" fill="none" stroke="#6e30b4" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></div></div>`;
  }).join('');
  [...$('#growth').querySelectorAll('.pointable')].forEach((host, gi) => {
    const [label, vals] = groups[gi];
    const g = line(vals, 300, 64);
    wirePoints(host, vals.length, (i) => {
      const back = vals.length - 1 - i;
      const d = i ? vals[i] - vals[i - 1] : 0;
      return { lines: [dayName(back), `${label}: ${num(vals[i])}`, i ? `${d >= 0 ? '+' : ''}${num(d)} on the day before` : 'First day shown'],
        x: g.pts[i][0] / 300, y: g.pts[i][1] / 64 };
    });
  });

  // Trips per day, stacked by service in a fixed order
  const totals = a.tripsPerDay.map((d) => SERVICES.reduce((s, x) => s + d[x.id], 0));
  const max = Math.max(...totals);
  $('#tripsTotal').textContent = `${num(totals.reduce((s, x) => s + x, 0))} this week`;
  $('#tripsLegend').innerHTML = SERVICES.map((s) => `<li><i style="--c:${s.color}"></i>${s.name}</li>`).join('');
  $('#trips').innerHTML = a.tripsPerDay.map((d, i) => {
    const tip = [`${d.day === 'Today' ? 'Today so far' : d.day}: ${num(totals[i])} trips`, ...SERVICES.map((s) => `${s.name} ${num(d[s.id])} · ${Math.round((d[s.id] / totals[i]) * 100)}%`)].join('|');
    return `<div class="stack7__col" data-tip="${esc(tip)}"><span class="stack7__n">${num(totals[i])}</span>
      <div class="stack7__bar" tabindex="0" aria-label="${esc(tip.replace(/\|/g, ', '))}" style="height:${Math.round((totals[i] / max) * 86)}%">
        ${SERVICES.map((s) => `<span style="flex:${d[s.id]};background:${s.color}"></span>`).join('')}</div></div>`;
  }).join('');
  $('#tripDays').innerHTML = a.tripsPerDay.map((d, i) => `<span${i === a.tripsPerDay.length - 1 ? ' class="is-today"' : ''}>${d.day}</span>`).join('');
  $('#tripsTable').innerHTML = `<thead><tr><th>Day</th>${SERVICES.map((s) => `<th class="num">${s.name}</th>`).join('')}<th class="num">Total</th></tr></thead>
    <tbody>${a.tripsPerDay.map((d, i) => `<tr><td>${d.day}</td>${SERVICES.map((s) => `<td class="num">${num(d[s.id])}</td>`).join('')}<td class="num"><b>${num(totals[i])}</b></td></tr>`).join('')}</tbody>`;

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
    <path d="${t.area}" fill="#6e30b4" fill-opacity=".1"/>
    <path d="${t.line}" fill="none" stroke="#3e1270" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  // gridline labels sit in HTML over the chart (text inside a stretched SVG would stretch too)
  $('#tipsWrap').querySelectorAll('.ylab').forEach((x) => x.remove());
  $('#tipsWrap').insertAdjacentHTML('beforeend', [4000, 8000].map((v) => `<span class="ylab" aria-hidden="true" style="top:${(gy(v) / 220) * 100}%">₱${num(v)}</span>`).join(''));
  const avg = Math.round(tips.reduce((s, x) => s + x, 0) / tips.length);
  wirePoints($('#tipsWrap'), tips.length, (i) => ({
    lines: [i === tips.length - 1 ? 'Today so far' : dayName(tips.length - 1 - i), `₱${num(tips[i])} in tips`,
      `${tips[i] >= avg ? '▲' : '▼'} ₱${num(Math.abs(tips[i] - avg))} ${tips[i] >= avg ? 'above' : 'below'} the 30-day average`],
    x: t.pts[i][0] / 600, y: t.pts[i][1] / 220,
  }));

  $('#payments').innerHTML = a.payments.map((p) => `<div class="hbar" tabindex="0" data-tip="${esc(`${p.name}|${p.share}% of trips · about ${num(Math.round((w.trips * p.share) / 100))} this week`)}"><span>${p.name}</span>
    <span class="hbar__track"><span class="hbar__fill" style="width:${p.share}%"></span></span><b>${p.share}%</b></div>`).join('');
  const first = a.driverFunnel[0].count || 1;
  $('#funnel').innerHTML = a.driverFunnel.map((f, i) => `<div class="hbar" tabindex="0" data-tip="${esc(`${f.name}: ${num(f.count)}|${Math.round((f.count / first) * 100)}% of those who applied${i ? `|${num(a.driverFunnel[i - 1].count - f.count)} dropped off after “${a.driverFunnel[i - 1].name}”` : ''}`)}"><span>${f.name}</span>
    <span class="hbar__track"><span class="hbar__fill hbar__fill--deep" style="width:${(f.count / first) * 100}%"></span></span><b>${num(f.count)}</b></div>`).join('');

  $('#areas').innerHTML = `<thead><tr><th>Area</th><th class="num">Trips</th><th class="num">Avg pickup</th><th class="num">Cancelled</th><th>Status</th></tr></thead>
    <tbody>${a.areas.map((r) => {
      const h = HEALTH[r.health] || HEALTH.good;
      return `<tr><td>${esc(r.name)}</td><td class="num">${num(r.trips)}</td><td class="num">${minSec(r.avgPickupSec)}</td><td class="num">${r.cancelledPct}%</td>
        <td><span tabindex="0" data-tip="${esc(`${h.label}|${h.why}`)}">${tag(h.chip, h.label)}</span></td></tr>`;
    }).join('')}</tbody>`;
}
