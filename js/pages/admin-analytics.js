/* Admin analytics (pages/admin-analytics.html): this week's numbers, growth, trips per day by service, tips,
   payments, the new-driver funnel and how each area is doing. One measure per chart; services keep fixed colours. */
import { adminAnalytics, errorMessage } from '../api.js';
import { $, esc, toast } from '../ui.js';
import { mountAdmin, SERVICES, minSec, num } from './admin-common.js';

const HEALTH = {
  good: { chip: 'approved', icon: '✓', label: 'Healthy' },
  warning: { chip: 'review', icon: '!', label: 'Long waits' },
  critical: { chip: 'fix', icon: '!!', label: 'Short on drivers' },
};

mountAdmin().then((user) => {
  if (!user) return;
  $('#statsPage').hidden = false;
  adminAnalytics().then(render).catch((err) => toast(errorMessage(err)));
});

/** A line through `vals` in a w×h box (with a little room top and bottom), and the area under it. */
function line(vals, w, h, lo = Math.min(...vals), hi = Math.max(...vals)) {
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 12)]);
  const d = pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  return { line: `M ${d}`, area: `M 2 ${h} L ${d} L ${w - 2} ${h} Z`, last: pts[pts.length - 1] };
}

function render(a) {
  $('#sampleChip').hidden = !a.sample;
  const w = a.week;
  const kpi = (l, v, d, bad) => `<div class="kpi6 glow-border"><span class="kpi6__l">${l}</span><span class="kpi6__v">${v}</span><span class="kpi6__d${bad ? ' kpi6__d--bad' : ''}">${d}</span></div>`;
  $('#kpis').innerHTML = kpi('Trips', num(w.trips), w.tripsChange) + kpi('Tips to mysabak', `₱${num(w.tips)}`, w.tipsChange)
    + kpi('Riders active', num(w.ridersActive), w.ridersChange) + kpi('Drivers active', num(w.driversActive), w.driversChange)
    + kpi('Average pickup', minSec(w.avgPickupSec), w.pickupChange) + kpi('Cancelled', `${w.cancelledPct}%`, w.cancelledChange, true);

  // Small multiples: each group on its own scale
  $('#growth').innerHTML = [['Riders registered', a.growth.riders], ['Drivers approved', a.growth.drivers], ['Shops', a.growth.shops]].map(([label, vals]) => {
    const g = line(vals, 300, 64);
    const delta = vals[vals.length - 1] - vals[0];
    const says = `${label}: ${num(vals[0])} 30 days ago, ${num(vals[vals.length - 1])} now`;
    return `<div class="multi"><span class="multi__l">${label}</span><span class="multi__v">${num(vals[vals.length - 1])}</span>
      <span class="multi__d">${delta >= 0 ? '▲' : '▼'} ${num(Math.abs(delta))} in 30 days</span>
      <svg class="spark" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="${esc(says)}"><title>${esc(says)}</title>
        <path d="${g.area}" fill="#6e30b4" fill-opacity=".1"/><path d="${g.line}" fill="none" stroke="#6e30b4" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></div>`;
  }).join('');

  // Trips per day, stacked by service in a fixed order
  const totals = a.tripsPerDay.map((d) => SERVICES.reduce((s, x) => s + d[x.id], 0));
  const max = Math.max(...totals);
  $('#tripsTotal').textContent = `${num(totals.reduce((s, x) => s + x, 0))} this week`;
  $('#tripsLegend').innerHTML = SERVICES.map((s) => `<li><i style="--c:${s.color}"></i>${s.name}</li>`).join('');
  $('#trips').innerHTML = a.tripsPerDay.map((d, i) => {
    const tip = `${d.day}: ${num(totals[i])} trips · ${SERVICES.map((s) => `${s.name} ${num(d[s.id])}`).join(' · ')}`;
    return `<div class="stack7__col"><span class="stack7__n">${num(totals[i])}</span>
      <div class="stack7__bar" tabindex="0" title="${tip}" aria-label="${tip}" style="height:${Math.round((totals[i] / max) * 86)}%">
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
  $('#tipsLine').setAttribute('aria-label', `Tips per day over 30 days, from ₱${num(tips[0])} to ₱${num(today)} today`);
  const gy = (v) => (216 - (v / 10000) * 208).toFixed(1);
  $('#tipsLine').innerHTML = `<line x1="0" y1="${gy(0)}" x2="600" y2="${gy(0)}" stroke="#eee4ec"/>
    <line x1="0" y1="${gy(4000)}" x2="600" y2="${gy(4000)}" stroke="#f4eef7"/><line x1="0" y1="${gy(8000)}" x2="600" y2="${gy(8000)}" stroke="#f4eef7"/>
    <path d="${t.area}" fill="#6e30b4" fill-opacity=".1"/>
    <path d="${t.line}" fill="none" stroke="#3e1270" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;

  $('#payments').innerHTML = a.payments.map((p) => `<div class="hbar" title="${p.name}: ${p.share}%"><span>${p.name}</span>
    <span class="hbar__track"><span class="hbar__fill" style="width:${p.share}%"></span></span><b>${p.share}%</b></div>`).join('');
  const first = a.driverFunnel[0].count || 1;
  $('#funnel').innerHTML = a.driverFunnel.map((f) => `<div class="hbar" title="${f.name}: ${f.count} (${Math.round((f.count / first) * 100)}%)"><span>${f.name}</span>
    <span class="hbar__track"><span class="hbar__fill hbar__fill--deep" style="width:${(f.count / first) * 100}%"></span></span><b>${num(f.count)}</b></div>`).join('');

  $('#areas').innerHTML = `<thead><tr><th>Area</th><th class="num">Trips</th><th class="num">Avg pickup</th><th class="num">Cancelled</th><th>Status</th></tr></thead>
    <tbody>${a.areas.map((r) => {
      const h = HEALTH[r.health] || HEALTH.good;
      return `<tr><td>${esc(r.name)}</td><td class="num">${num(r.trips)}</td><td class="num">${minSec(r.avgPickupSec)}</td><td class="num">${r.cancelledPct}%</td>
        <td><span class="tag tag--${h.chip}">${h.icon} ${h.label}</span></td></tr>`;
    }).join('')}</tbody>`;
}
