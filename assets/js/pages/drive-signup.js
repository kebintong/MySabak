/* Driver sign-up (pages/drive-signup.html): 3 steps (about you, vehicle, documents) → driverApply(). */
import { driverApply, errorMessage } from '../api.js';
import { $, $$, mountChrome, toast, wirePasswordReveal } from '../ui.js';

mountChrome();

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
  form.closest('.auth-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      email: data.get('email').trim(),
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
    location.href = '/pages/driver.html';
  } catch (err) {
    toast(errorMessage(err));
    next.disabled = false;
    next.textContent = 'Submit application';
  }
});
