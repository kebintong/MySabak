/* Merchant sign-in (pages/merchant.html): mobile number or email + password → merchantSignIn() → dashboard.
   A branch manager's first time: "Set up a branch account" with the owner's code → setupBranchAccount(). */
import { merchantHome, merchantSignIn, setupBranchAccount, errorMessage } from '../api.js';
import { $, $$, mountChrome, toast, wireSignInForm, wirePasswordReveal } from '../ui.js';

mountChrome({ signIn: false }); // this page is the sign-in form

// Already signed in on this device → straight to the dashboard
merchantHome().then(() => location.replace('/pages/merchant-home.html')).catch(() => {});

wireSignInForm($('#signinForm'), merchantSignIn, '/pages/merchant-home.html');

/* Sign in ↔ Set up a branch account */
const setup = $('#setupForm');
wirePasswordReveal(setup);
function showSetup(on) {
  setup.hidden = !on;
  $('#signinForm').hidden = on;
  $('#signinTitle').textContent = on ? 'Set up your branch account' : 'Merchant sign in';
  $('#setupLink').textContent = on ? 'Back to sign in' : 'Set up a branch account';
  $('#setupSwitch .signin__ask').textContent = on ? 'Already set up?' : 'Managing a branch?';
  $('#setupSwitch .signin__hint').textContent = on ? 'Sign in with your mobile number or email.' : 'Use the setup code from your shop owner.';
  (on ? setup.elements.code : $('#signinForm').elements.login).focus();
}
$('#setupLink').addEventListener('click', (e) => { e.preventDefault(); showSetup(setup.hidden); });
setup.elements.code.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
setup.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('.field__error', setup);
  const btn = $('[type="submit"]', setup);
  const f = setup.elements;
  btn.disabled = true;
  error.hidden = true;
  try {
    await setupBranchAccount({ code: f.code.value, login: f.login.value, password: f.password.value });
    location.href = '/pages/merchant-home.html';
  } catch (err) {
    error.textContent = err.status === 400 ? err.message : errorMessage(err);
    error.hidden = false;
    btn.disabled = false;
  }
});

$('#forgot').addEventListener('click', (e) => { e.preventDefault(); toast('Password reset by text message is coming soon.'); });
$$('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(`${a.dataset.soon} will be linked here.`); }));
$('#partnerLink').addEventListener('click', (e) => { e.preventDefault(); toast('Partner sign-up for shops is coming soon. Email us to get listed.'); });
