/* =========================================================
   mysabak · shared bits for the merchant screens (dashboard + POS)
   Product pictures, photo upload (resized in the browser), number formats and small animations.
   ========================================================= */
import { itemPicture } from './placeholders.js';
import { esc } from './ui.js';

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The sample menu uses drawn pictures (assets/images/food-*.svg); the merchant's own photos replace them. */
export const isOwnPhoto = (item) => Boolean(item && item.image) && !/^\/assets\/images\/food-/.test(item.image);

/** <img> or drawn picture for a product. */
export function productPic(item, color = '#5630d8') {
  return item && item.image
    ? `<img src="${esc(item.image)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('is-loaded')">`
    : itemPicture(item, color);
}

/**
 * Turn a photo the merchant picked into a small JPEG data URL (longest side 720px), so it uploads fast.
 * BACKEND: send the result (or the original File) as an upload and store the returned URL.
 */
export async function photoFromFile(file, max = 720) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose a photo (JPG, PNG or WebP).');
  if (file.size > 20e6) throw new Error('That photo is too big (20 MB max).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Couldn’t open that photo. Try another one.'));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Numbers count up to their value; `format` turns the number into text. */
export function countUp(el, to, format = String) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = String(to);
  if (reduceMotion() || from === to) { el.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = format(to);
  };
  requestAnimationFrame(step);
}

/** Slide the white pill of a .seg--pill to its selected button. */
export function slidePill(seg) {
  const on = seg && seg.querySelector('[aria-selected="true"]');
  if (!on) return;
  seg.style.setProperty('--pill-x', `${on.offsetLeft}px`);
  seg.style.setProperty('--pill-w', `${on.offsetWidth}px`);
  seg.classList.add('is-ready');
}

/** Replay a one-shot CSS animation class on an element. */
export function flash(el, cls = 'is-flash') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
}

/** 2.5 → "2.5", 0.333333 → "0.333", 12 → "12" */
export const qty = (n) => String(Math.round(Number(n || 0) * 1000) / 1000);

/** Stock state of an ingredient: 'out' | 'low' | 'ok'. */
export const stockState = (i) => (i.stock <= 0 ? 'out' : i.stock <= i.low ? 'low' : 'ok');

/** How full the bar is: stock against twice the low level (a comfortable amount). */
export const stockFill = (i) => Math.max(0, Math.min(100, (i.stock / Math.max(i.low * 2, 0.001)) * 100));

/** Wire a <dialog class="sheet">: [data-close] buttons, backdrop click and Escape close it. */
export function wireSheet(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
  return dialog;
}
