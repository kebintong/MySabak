/* Driver sign-in (pages/drive.html): mobile number or email + password → driverSignIn() → driver home. */
import { driverStatus, driverSignIn } from '../api.js';
import { $, $$, mountChrome, toast, wireSignInForm } from '../ui.js';

mountChrome({ signIn: false }); // this page is the sign-in form

// Already signed in on this device → straight to the driver home
driverStatus().then((d) => { if (d.signedIn) location.replace('/pages/driver.html'); });

wireSignInForm($('#signinForm'), driverSignIn, '/pages/driver.html');

$('#forgot').addEventListener('click', (e) => { e.preventDefault(); toast('Password reset by text message is coming soon.'); });
$$('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(`${a.dataset.soon} will be linked here.`); }));
