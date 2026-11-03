/* Admin overview (pages/admin.html): live counts of riders, drivers and merchants, applications waiting for
   review, and today's numbers. */
import { adminOverview, adminApplications, errorMessage } from '../api.js';
import { $, esc, toast } from '../ui.js';
import { mountAdmin, SERVICES, STATUS, VEHICLE, minSec, num, initials, ago } from './admin-common.js';

mountAdmin().then((user) => {
  if (!user) return;
  const h = new Date().getHours();
  $('#greeting').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${String(user.name).split(/\s+/)[0]}`;
  $('#whoLine').textContent = user.email ? `Signed in as ${user.email}` : 'Signed in';
  $('#adminHome').hidden = false;
  load().catch((err) => toast(errorMessage(err)));
});

async function load() {
  const [o, drivers, shops] = await Promise.all([adminOverview(), adminApplications('drivers'), adminApplications('merchants')]);
  $('#sampleChip').hidden = !o.sample;
  $('#todaySample').hidden = !o.sample;

  const card = (label, now, word, total, extra, art, href, good) => `
    <article class="count glow-border">
      <span class="count__label">${label}</span>
      <span class="count__now">${num(now)} <small>${word}</small></span>
      <span class="count__total">${total}</span>
      ${href ? `<a class="count__extra" href="${href}">${extra}</a>` : `<span class="count__extra${good ? ' count__extra--good' : ''}">${extra}</span>`}
      <img class="count__art" src="${art}" alt="" width="96" height="72">
    </article>`;
  $('#counts').innerHTML = card('Riders', o.riders.online, 'using the app now', `${num(o.riders.registered)} registered`, `▲ ${num(o.riders.joinedToday)} joined today`, '/assets/images/3d/mascot.webp', null, true)
    + card('Drivers', o.drivers.online, 'online now', `${num(o.drivers.approved)} approved · ${num(o.drivers.onTrip)} on a trip`,
      o.drivers.waiting ? `${o.drivers.waiting} waiting for review` : 'No one waiting for review', '/assets/images/3d/car.webp', '/pages/admin-registrations.html?kind=drivers')
    + card('Merchants', o.merchants.open, 'shops open now', `${num(o.merchants.shops)} shops`,
      o.merchants.waiting ? `${o.merchants.waiting} new shops to approve` : 'No shops waiting', '/assets/images/3d/food.webp', '/pages/admin-registrations.html?kind=merchants');

  // The newest applications still waiting, drivers and shops together
  const waiting = [...drivers, ...shops].filter((a) => a.status === 'review').sort((a, b) => b.appliedAt - a.appliedAt).slice(0, 5);
  $('#waitList').innerHTML = waiting.length ? waiting.map((a) => {
    const name = a.kind === 'drivers' ? a.name : a.shop;
    const what = a.kind === 'drivers' ? `Driver · ${VEHICLE[a.vehicle] || a.vehicle} · ${a.city}` : `Shop · ${a.category} · ${a.area}`;
    return `<li><a class="waitrow" href="/pages/admin-registrations.html?kind=${a.kind}&id=${encodeURIComponent(a.id)}">
      <span class="waitrow__ava" aria-hidden="true">${esc(initials(name))}</span>
      <span class="row__main"><span class="row__title">${esc(name)}</span><span class="row__sub">${esc(what)} · ${esc(ago(a.appliedAt))}</span></span>
      <span class="tag tag--review">${STATUS.review.icon} ${STATUS.review.label}</span></a></li>`;
  }).join('') : '<li class="empty">No one is waiting for review.</li>';

  const t = o.today;
  $('#today').innerHTML = `<div><span class="today__n">${num(t.trips)}</span><span class="today__l">trips and orders</span></div>
    <div><span class="today__n">₱${num(t.tips)}</span><span class="today__l">tips to mysabak</span></div>
    <div><span class="today__n">${minSec(t.avgPickupSec)}</span><span class="today__l">average pickup</span></div>`;
  const total = SERVICES.reduce((s, x) => s + t.byService[x.id], 0) || 1;
  $('#svcbar').setAttribute('aria-label', `Trips by service: ${SERVICES.map((s) => `${s.name} ${t.byService[s.id]}`).join(', ')}`);
  $('#svcbar').innerHTML = SERVICES.map((s) => `<span style="flex:${t.byService[s.id]};background:${s.color}" title="${s.name}: ${t.byService[s.id]} (${Math.round((t.byService[s.id] / total) * 100)}%)"></span>`).join('');
  $('#svcLegend').innerHTML = SERVICES.map((s) => `<li><i style="--c:${s.color}"></i>${s.name} <b>${num(t.byService[s.id])}</b></li>`).join('');
}
