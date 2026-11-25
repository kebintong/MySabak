/* Driver account (pages/driver-account.html): who's driving; the profile and the vehicle (read-only: the mysabak
   team changes them); settings that work on this device (request alerts); help (the Driver Hub), the rules, sign out. */
import { CONFIG } from '../config.js';
import { driverStatus, signOut } from '../api.js';
import { $, $$, mountChrome, icon, ava, tag, esc, sheet } from '../ui.js';

mountChrome({ roles: ['driver'] });

const bindAll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });

async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; }
  const vehicle = CONFIG.vehicles.find((v) => v.id === d.vehicle);
  const vName = vehicle ? vehicle.name : d.vehicle || 'Not added';
  bindAll('name', d.name || 'Driver');
  $('.dwho__ava').outerHTML = ava(d.name || 'Driver', 'dwho__ava');
  bindAll('vehicle', [vName, d.plate].filter(Boolean).join(' · '));
  bindAll('vehicleName', vName);
  if (d.plate) bindAll('plate', d.plate);
  if (d.phone) bindAll('phone', d.phone);
  if (d.email) bindAll('email', d.email);
  const approved = d.status === 'approved';
  $('[data-bind="statusTag"]').innerHTML = approved ? tag('approved', 'Approved') : tag('review', 'Under review');
  // Approved: a small gold check by the name. Anything else says so in words
  $$('[data-bind="status"]').forEach((s) => {
    if (approved) {
      s.className = 'dwho__ok';
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', 'Approved driver');
      s.innerHTML = icon('i-check');
    } else {
      s.className = 'tag tag--review';
      s.innerHTML = `${icon('i-st-wait')}Under review`;
    }
  });
}

// Request alerts: the same setting as the Alerts button on the Drive page (this device)
const ALERTS = 'mysabak.driverAlerts';
const alertsOn = () => { try { return localStorage.getItem(ALERTS) !== 'off'; } catch (_) { return true; } };
const sw = $('#alertsSwitch');
const paintAlerts = () => sw.setAttribute('aria-checked', String(alertsOn()));
sw.addEventListener('click', () => {
  try { localStorage.setItem(ALERTS, alertsOn() ? 'off' : 'on'); } catch (_) { /* storage off: nothing to keep */ }
  paintAlerts();
});
paintAlerts();

// Get help: the Driver Hub's details (CONFIG.driverOffice, the same as on the sign-up page), and 911 for emergencies
const office = CONFIG.driverOffice;
$('[data-help]').addEventListener('click', (e) => {
  const tel = String(office.phone || '').replace(/[^\d+]/g, '');
  sheet('Get help', `<p class="sheet__sub">For your account, a payment or a trip, the ${esc(office.name)} can help.</p>
    <dl class="dglance__rows">
      ${office.phone ? `<div><dt>Phone</dt><dd><a href="tel:${esc(tel)}">${esc(office.phone)}</a></dd></div>` : ''}
      <div><dt>Address</dt><dd>${esc(office.address)}</dd></div>
      <div><dt>Hours</dt><dd>${esc(office.hours)}</dd></div>
    </dl>
    <p class="dacct__note">In an emergency, call <a href="tel:911">911</a>.</p>
    <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Close</button></div>`).then(() => e.currentTarget?.focus?.());
});
$('#signOutBtn').addEventListener('click', async () => {
  await signOut();
  location.href = '/pages/drive.html';
});
start();
