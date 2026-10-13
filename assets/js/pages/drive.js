/* Drive landing (pages/drive.html): pitch + sign-up, or a link to the driver home once signed up. */
import { driverStatus } from '../api.js';
import { $, mountChrome, icon } from '../ui.js';

mountChrome();

driverStatus().then((d) => {
  if (d.status === 'none') return;
  const cta = $('#driveCta');
  cta.href = '/pages/driver.html';
  cta.innerHTML = `${d.status === 'approved' ? 'Go to driver home' : 'See your application'} ${icon('i-arrow')}`;
});
