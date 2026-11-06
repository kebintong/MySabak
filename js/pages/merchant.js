/* Merchant sign-in (pages/merchant.html): mobile number or email + password → merchantSignIn() → dashboard.
   A shop that wants to sell: Become a partner. */
import { merchantHome, merchantSignIn } from '../api.js';
import { $, $$, mountChrome, toast, wireSignInForm } from '../ui.js';

mountChrome(); // this page is the sign-in form

// Already signed in on this device → straight to the dashboard
merchantHome().then(() => location.replace('/pages/merchant-home.html')).catch(() => {});

wireSignInForm($('#signinForm'), merchantSignIn, '/pages/merchant-home.html');

$('#forgot').addEventListener('click', (e) => { e.preventDefault(); toast('Password reset by text message is coming soon.'); });
$$('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(`${a.dataset.soon} will be linked here.`); }));
$('#partnerLink').addEventListener('click', (e) => { e.preventDefault(); toast('Partner sign-up for shops is coming soon. Email us to get listed.'); });
