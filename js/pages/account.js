/* Account (pages/account.html): customer sign in when signed out; the customer's account when signed in.
   Drivers and merchants have their own sign-in forms (the switch at the top of the card). */
import { clientSignIn } from '../api.js';
import { $, $$, mountChrome, toast, wireSignInForm } from '../ui.js';

mountChrome({ signIn: false, roles: ['client'] }).then((user) => {
  if (user && user.role !== 'client') return; // being sent to their own home
  if (!user) { $('#signedOut').hidden = false; return; }
  $('#firstName').textContent = String(user.name).split(/\s+/)[0];
  $('#whoLine').textContent = user.email ? `Signed in as ${user.email}` : 'Signed in';
  $('#signedIn').hidden = false;
});

wireSignInForm($('#signinForm'), clientSignIn, '/');

$('#forgot').addEventListener('click', (e) => { e.preventDefault(); toast('Password reset by text message is coming soon.'); });
$('#signupLink').addEventListener('click', (e) => { e.preventDefault(); toast('Customer sign-up is coming soon.'); });
$$('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(`${a.dataset.soon} will be linked here.`); }));
