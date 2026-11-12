/* Driver account (pages/driver-account.html): who's driving, their vehicle and payout, help, and sign out. */
import { CONFIG } from '../config.js';
import { driverStatus, signOut } from '../api.js';
import { $, $$, mountChrome, toast, icon, ava } from '../ui.js';

mountChrome({ roles: ['driver'] });

const bindAll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });

async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; }
  const vehicle = CONFIG.vehicles.find((v) => v.id === d.vehicle);
  const vName = vehicle ? vehicle.name : d.vehicle;
  bindAll('name', d.name || 'Driver');
  $('.dwho__ava').outerHTML = ava(d.name || 'Driver', 'dwho__ava');
  bindAll('vehicle', [vName, d.plate].filter(Boolean).join(' · '));
  bindAll('vehicleLong', [vName, d.plate, 'documents on file'].filter(Boolean).join(' · '));
  bindAll('contact', [d.phone, d.email].filter(Boolean).join(' · ') || 'Mobile number and email');
  // Approved: a small gold check by the name. Anything else says so in words
  $$('[data-bind="status"]').forEach((s) => {
    if (d.status === 'approved') {
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

$$('[data-payout]').forEach((b) => b.addEventListener('click', () => toast('Payout setup (GCash or bank) is coming soon.')));
$('[data-help]').addEventListener('click', () => toast('Help is coming soon. For now, call our office at (032) 000 0000.'));
$('#signOutBtn').addEventListener('click', async () => {
  await signOut();
  location.href = '/pages/drive.html';
});
start();
