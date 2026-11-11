/* Admin overview (pages/admin.html): live counts of riders, drivers and merchants, applications waiting for
   review, and today's numbers. */
import { adminOverview, adminApplications, errorMessage } from '../api.js';
import { $, $$, esc, toast, icon, rollNumber, ava, emptyRows } from '../ui.js';
import { mountAdmin, SERVICES, STATUS, VEHICLE, minSec, num, since, tag, wireTips } from './admin-common.js';

mountAdmin().then((user) => {
  if (!user) return;
  const h = new Date().getHours();
  $('#greeting').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${String(user.name).split(/\s+/)[0]}`;
  // the date, because "Today so far" below needs it (who's signed in is in the profile menu)
  $('#dateLine').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#adminHome').hidden = false;
  wireTips($('#adminHome'));
  load().catch((err) => toast(errorMessage(err)));
});

async function load() {
  const [o, drivers, shops] = await Promise.all([adminOverview(), adminApplications('drivers'), adminApplications('merchants')]);

  // Each count: what's happening now, the total, and the one thing to act on (a link when there is something to do)
  const pct = (a, b) => `${Math.round((a / (b || 1)) * 100)}%`;
  const card = (label, now, word, total, extra, href, good, tip) => `
    <article class="count" tabindex="0" data-tip="${esc(tip)}">
      <span class="stat-l">${label}</span>
      <span class="count__now"><b class="count__n">${num(now)}</b> <small>${word}</small></span>
      <span class="count__total">${total}</span>
      ${href ? `<a class="count__extra" href="${href}">${extra}${icon('i-chevron', 'icon--sm')}</a>` : `<span class="count__extra${good ? ' count__extra--good' : ''}">${extra}</span>`}
    </article>`;
  const r = o.riders; const d = o.drivers; const m = o.merchants;
  $('#counts').innerHTML = card('Riders', r.online, 'online', `${num(r.registered)} registered`, `▲ ${num(r.joinedToday)} joined today`, null, true,
    `Riders right now|${num(r.online)} of ${num(r.registered)} registered riders have the app open (${pct(r.online, r.registered)})|${num(r.joinedToday)} new accounts since midnight`)
    + card('Drivers', d.online, 'online', `${num(d.approved)} approved · ${num(d.onTrip)} on a trip`,
      d.waiting ? `${d.waiting} waiting for review` : 'No one waiting for review', d.waiting ? '/pages/admin-registrations.html?kind=drivers' : null, false,
      `Drivers right now|${num(d.onTrip)} on a trip · ${num(d.online - d.onTrip)} free for a booking|${pct(d.online, d.approved)} of approved drivers are online`)
    + card('Merchants', m.open, 'open', `${num(m.shops)} shops`,
      m.waiting ? `${m.waiting} new shops to approve` : 'No shops waiting', m.waiting ? '/pages/admin-registrations.html?kind=merchants' : null, false,
      `Shops right now|${num(m.open)} of ${num(m.shops)} shops are taking orders (${pct(m.open, m.shops)})|${num(m.shops - m.open)} closed for now`);

  // The newest applications still waiting, drivers and shops together
  const waiting = [...drivers, ...shops].filter((a) => a.status === 'review').sort((a, b) => b.appliedAt - a.appliedAt).slice(0, 5);
  $('#waitList').innerHTML = waiting.length ? waiting.map((a, i) => {
    const name = a.kind === 'drivers' ? a.name : a.shop;
    const what = a.kind === 'drivers' ? `Driver · ${VEHICLE[a.vehicle] || a.vehicle} · ${a.city}` : `Shop · ${a.category} · ${a.area}`;
    return `<li style="--i:${i}"><a class="waitrow" href="/pages/admin-registrations.html?kind=${a.kind}&id=${encodeURIComponent(a.id)}">
      ${ava(name)}
      <span class="row__main"><span class="row__title">${esc(name)}</span><span class="row__sub">${esc(what)} · ${esc(since(a.appliedAt))}</span></span>
      ${tag('review', STATUS.review.label)}</a></li>`;
  }).join('') : emptyRows('All caught up', 'New driver and shop applications show up here.');

  const t = o.today;
  $('#today').innerHTML = `<div><b class="today__n">${num(t.trips)}</b><span class="today__l">trips and orders</span></div>
    <div><b class="today__n">₱${num(t.tips)}</b><span class="today__l">tips to mysabak</span></div>
    <div><b class="today__n">${minSec(t.avgPickupSec)}</b><span class="today__l">average pickup</span></div>`;
  const total = SERVICES.reduce((s, x) => s + t.byService[x.id], 0) || 1;
  $('#svcbar').setAttribute('aria-label', `Trips by service: ${SERVICES.map((s) => `${s.name} ${t.byService[s.id]}`).join(', ')}`);
  $('#svcbar').innerHTML = SERVICES.map((s) => `<span style="flex:${t.byService[s.id]};background:${s.color}" tabindex="0"
    data-tip="${s.name}|${num(t.byService[s.id])} trips today · ${Math.round((t.byService[s.id] / total) * 100)}% of all"></span>`).join('');
  $('#svcLegend').innerHTML = SERVICES.map((s) => `<li><i style="--c:${s.color}"></i>${s.name} <b>${num(t.byService[s.id])}</b></li>`).join('');

  // Weekly tips: the total, the change on the 7 days before, and a bar per day (today so far is the last)
  const w = o.tipsWeek;
  const sum = w.values.reduce((a, b) => a + b, 0);
  const change = Math.round(((sum - w.lastWeek) / (w.lastWeek || 1)) * 100);
  const max = Math.max(...w.values);
  $('#wtipsTotal').textContent = `₱${num(sum)}`;
  $('#wtipsChange').textContent = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% on the week before`;
  $('#wtipsChange').classList.toggle('kpi6__d--bad', change < 0);
  $('#wtipsBars').innerHTML = w.values.map((v, i) => {
    const today = i === w.values.length - 1;
    const label = today ? 'Today so far' : w.days[i];
    return `<div class="wbar${today ? ' is-today' : ''}" tabindex="0" style="--i:${i}" data-tip="₱${num(v)}|${label}|${Math.round((v / sum) * 100)}% of the week">
      <span class="wbar__fill" style="height:${Math.max(6, Math.round((v / max) * 100))}%"></span><span class="wbar__d">${esc(w.days[i])}</span></div>`;
  }).join('');
  $('#wtipsBars').setAttribute('aria-label', `Tips per day: ${w.values.map((v, i) => `${w.days[i]} ₱${num(v)}`).join(', ')}`);
  $$('.count__n, .today__n, #wtipsTotal').forEach((b) => rollNumber(b));
}
