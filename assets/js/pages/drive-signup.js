/* Driver sign-up (pages/drive-signup.html): details, vehicle, documents → driverApply(). */
import { driverApply, errorMessage } from '../api.js';
import { $, $$, mountChrome, toast } from '../ui.js';

mountChrome();

const form = $('#signupForm');
const button = $('#signupBtn');

// Show the chosen file's name in each document box
$$('[data-file]', form).forEach((box) => {
  const input = $('input', box);
  input.addEventListener('change', () => {
    const file = input.files[0];
    box.classList.toggle('is-done', Boolean(file));
    $('.file__status', box).textContent = file ? `${file.name} · ready` : 'Photo or PDF';
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    const first = $(':invalid', form);
    if (first) first.closest('.field, .file, .check, fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const data = new FormData(form);
  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    await driverApply({
      name: data.get('name').trim(),
      phone: data.get('phone').replace(/\s+/g, ''),
      email: data.get('email').trim(),
      city: data.get('city'),
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
    button.disabled = false;
    button.textContent = 'Submit application';
  }
});
