/* Admin (pages/admin.html): review driver applications.
   Admins sign in on the customer form (pages/account.html); nothing on the site links here. */
import { adminDriverApplications, adminDecideDriver, errorMessage } from '../api.js';
import { $, mountChrome, toast, esc, when } from '../ui.js';

const VEHICLE = { motor: 'Motor', sedan: 'Sedan', suv: 'SUV' };

mountChrome({ roles: ['admin'] }).then((user) => {
  if (user && user.role !== 'admin') return; // being sent to their own home
  if (!user) { location.replace('/pages/account.html'); return; }
  $('#whoLine').textContent = user.email ? `Signed in as ${user.email}` : 'Signed in';
  $('#adminHome').hidden = false;
  loadDrivers();
});

async function loadDrivers() {
  const list = $('#driverApps');
  try {
    const apps = await adminDriverApplications();
    $('#driverCount').textContent = String(apps.length);
    list.innerHTML = apps.length
      ? apps.map((a) => `<li class="row app-row" data-phone="${esc(a.phone)}">
          <div class="row__main"><span class="row__title">${esc(a.name)}</span>
            <span class="row__sub">${esc(VEHICLE[a.vehicle] || a.vehicle)} · ${esc(a.model)} ${esc(a.year)} · ${esc(a.plate)}</span>
            <span class="row__sub">License ${esc(a.licenseNumber)} · ${esc(a.city)} · ${esc(a.email)} · applied ${esc(when(a.appliedAt))}</span></div>
          <div class="row__end">
            <button type="button" class="button" data-decide="approved">Approve</button>
            <button type="button" class="button button--ghost" data-decide="rejected">Reject</button>
          </div></li>`).join('')
      : '<li class="empty">No driver applications waiting.</li>';
  } catch (err) {
    list.innerHTML = `<li class="empty">${esc(errorMessage(err))}</li>`;
  }
}

$('#driverApps').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-decide]');
  if (!btn) return;
  const row = btn.closest('[data-phone]');
  row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const { status } = await adminDecideDriver({ phone: row.dataset.phone, decision: btn.dataset.decide });
    toast(status === 'approved' ? 'Approved. They can go online now.' : 'Rejected.');
  } catch (err) {
    toast(errorMessage(err));
  }
  loadDrivers();
});
