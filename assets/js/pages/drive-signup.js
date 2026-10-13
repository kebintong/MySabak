/* Driver sign-up (pages/drive-signup.html).
   Choose how to apply: walk in at the office (#walk-in) or apply online (#online: 3 steps → driverApply()
   → "Application sent", updates by email). */
import { CONFIG } from '../config.js';
import { driverApply, errorMessage } from '../api.js';
import { $, $$, mountChrome, toast, wirePasswordReveal } from '../ui.js';

mountChrome();

/* ---------- Views: choose / walk-in / online / done ---------- */
const views = $$('[data-view]');
function showView(name) {
  views.forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.title = `${{ 'walk-in': 'Walk in', online: 'Apply online', done: 'Application sent' }[name] || 'Sign up to drive'} · mysabak`;
}
const route = () => {
  const name = location.hash.slice(1);
  showView(['walk-in', 'online'].includes(name) ? name : 'choose');
  window.scrollTo(0, 0);
  $('.content').scrollTo(0, 0);
};
window.addEventListener('hashchange', route);

/* ---------- Walk in: office details (CONFIG.driverOffice) ---------- */
const office = CONFIG.driverOffice;
$$('[data-office]').forEach((n) => {
  const key = n.dataset.office;
  if (key === 'bring') n.innerHTML = office.bring.map((b) => `<li>${b}</li>`).join('');
  else n.textContent = office[key];
});
$('#directionsBtn').addEventListener('click', () => toast('Directions will open in Maps once the office address is final.'));

const form = $('#signupForm');
const steps = $$('.wizard__step', form);
const labels = $$('[data-step-label]');
const back = $('#backBtn');
const next = $('#nextBtn');
let step = 0;

function show(i) {
  step = i;
  steps.forEach((s, n) => { s.hidden = n !== i; });
  labels.forEach((l, n) => {
    l.classList.toggle('is-current', n === i);
    l.classList.toggle('is-done', n < i);
    if (n === i) l.setAttribute('aria-current', 'step'); else l.removeAttribute('aria-current');
  });
  back.hidden = i === 0;
  next.textContent = i === steps.length - 1 ? 'Submit application' : 'Next';
  const first = $('input:not([type="radio"]):not([type="checkbox"]), select', steps[i]);
  if (first) first.focus({ preventScroll: true });
  $('.content').scrollTo({ top: 0, behavior: 'smooth' });
}

/** Only the fields on the current step have to be valid to move on. */
function stepIsValid() {
  const fields = $$('input, select', steps[step]);
  const bad = fields.find((f) => !f.checkValidity());
  if (bad) { bad.reportValidity(); return false; }
  return true;
}

// Show the chosen file's name in each document box
$$('[data-file]', form).forEach((box) => {
  const input = $('input', box);
  const status = $('.file__status', box);
  input.addEventListener('change', () => {
    const file = input.files[0];
    box.classList.toggle('is-done', Boolean(file));
    status.textContent = file ? `${file.name} · ready` : status.dataset.hint;
  });
});

wirePasswordReveal(form);
$$('[data-soon]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast(`${a.dataset.soon} will be linked here.`); }));

back.addEventListener('click', () => show(step - 1));

form.addEventListener('submit', async (e) => {
  e.preventDefault(); // Enter or Next: go to the next step, or submit on the last one
  if (!stepIsValid()) return;
  if (step < steps.length - 1) { show(step + 1); return; }

  const data = new FormData(form);
  next.disabled = true;
  next.textContent = 'Submitting…';
  try {
    await driverApply({
      name: data.get('name').trim(),
      phone: data.get('phone').replace(/\s+/g, ''),
      email: data.get('email').trim().toLowerCase(),
      city: data.get('city'),
      password: data.get('newPassword'),
      vehicle: data.get('vehicle'),
      plate: data.get('plate').trim().toUpperCase(),
      model: data.get('model').trim(),
      year: Number(data.get('year')),
      licenseNumber: data.get('licenseNumber').trim().toUpperCase(),
      files: { license: data.get('license'), orcr: data.get('orcr'), selfie: data.get('selfie') },
      agreed: data.get('agreed') === 'on',
    });
    $('[data-bind="doneName"]').textContent = data.get('name').trim().split(' ')[0];
    $('[data-bind="doneEmail"]').textContent = data.get('email').trim().toLowerCase();
    showView('done');
    history.replaceState(null, '', location.pathname); // Back doesn't return to the filled-in form
    $('.content').scrollTo(0, 0);
  } catch (err) {
    toast(errorMessage(err));
    next.disabled = false;
    next.textContent = 'Submit application';
  }
});

route();
