/* Driver sign-in (pages/drive.html): mobile number or email + password → driverSignIn() → driver home. */
import { driverStatus, driverSignIn, errorMessage } from '../api.js';
import { $, $$, mountChrome, toast, wirePasswordReveal } from '../ui.js';

mountChrome();

// Already signed in on this device → straight to the driver home
driverStatus().then((d) => { if (d.signedIn) location.replace('/pages/driver.html'); });

const form = $('#signinForm');
const button = $('#signinBtn');
const error = $('#signinError');
wirePasswordReveal(form);

const loginInput = form.elements.login;
const PHONE = /^(\+?63|0)9\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The login must look like a PH mobile number or an email. */
function checkLogin() {
  const v = loginInput.value.trim();
  const ok = v.includes('@') ? EMAIL.test(v) : PHONE.test(v.replace(/[\s-]/g, ''));
  loginInput.setCustomValidity(!v || ok ? '' : 'Enter a mobile number (09XX XXX XXXX) or an email address.');
}
loginInput.addEventListener('input', checkLogin);

function showError(message) {
  error.textContent = message;
  error.hidden = !message;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  checkLogin();
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const data = new FormData(form);
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const login = data.get('login').trim();
    await driverSignIn({ login: login.includes('@') ? login : login.replace(/[\s-]/g, ''), password: data.get('password') });
    location.href = '/pages/driver.html';
  } catch (err) {
    showError(err.status === 401 || err.status === 400 ? err.message : errorMessage(err));
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

$('#forgot').addEventListener('click', (e) => { e.preventDefault(); toast('Password reset by text message is coming soon.'); });
$$('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(`${a.dataset.soon} will be linked here.`); }));
