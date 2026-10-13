/* =========================================================
   mysabak · shared UI for every page
   Top bar + tab bar, toast, place search, tip picker and tip sheet.
   ========================================================= */
import { CONFIG } from './config.js';
import { searchPlaces, placeLocation, sendTip, errorMessage } from './api.js';
import { peso as formatPeso, cleanTip } from './money.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const peso = (n) => formatPeso(n, CONFIG.currency);
export const pesoOr = (n, placeholder = '[AMOUNT]') => (typeof n === 'number' ? peso(n) : `${CONFIG.currency}${placeholder}`);

/** Escape text for HTML strings. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = '/assets/images/icons.svg';
/** <svg> for an icon in assets/images/icons.svg */
export const icon = (id, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${ICONS}#${id}"/></svg>`;

/* ---------- Top bar + tab bar ---------- */
export const TABS = [
  { id: 'ride', label: 'Ride', icon: 'i-car', href: '/' },
  { id: 'drive', label: 'Drive', icon: 'i-wheel', href: '/pages/drive.html' },
  { id: 'shops', label: 'Shops', icon: 'i-bag', href: '/pages/shops.html' },
  { id: 'support', label: 'Support', icon: 'i-heart', href: '/pages/support.html' },
  { id: 'account', label: 'Account', icon: 'i-user', href: '/pages/account.html', mobileOnly: true },
];

/** Fill <header data-topbar> and <nav data-tabs="shops"> on a page, and start offline support. */
export function mountChrome() {
  const top = $('[data-topbar]');
  if (top) {
    top.innerHTML = `
      <a class="brand" href="/" aria-label="mysabak home"><img src="/assets/images/logo.svg" alt="mysabak" width="150" height="35"></a>
      <div class="topbar__actions">
        <button type="button" class="btn btn--ghost btn--install" data-install hidden>${icon('i-download')}<span class="mobile-only">Install</span><span class="desktop-only">Install app</span></button>
        <a class="btn btn--dark" href="/pages/account.html">Sign in</a>
      </div>`;
    setupInstall($('[data-install]', top));
  }
  const nav = $('[data-tabs]');
  if (nav) {
    const active = nav.dataset.tabs;
    nav.innerHTML = TABS.map((t) => {
      const on = t.id === active;
      return `<a class="tab${on ? ' is-active' : ''}${t.mobileOnly ? ' mobile-only' : ''}" href="${t.href}"${on ? ' aria-current="page"' : ''}>`
        + `<span class="tab__icon">${icon(t.icon, `icon--xl${on ? '' : ' icon--muted'}`)}</span>`
        + `<span class="tab__label">${t.label}</span>${t.mobileOnly ? '' : '<span class="tab__dot desktop-only"></span>'}</a>`;
    }).join('');
  }
  if (!$('#toast')) document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast" role="status" aria-live="polite"></div>');
  registerServiceWorker();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    // Lives in assets/js/ but looks after the whole site (the server allows scope '/').
    const worker = new URL('/assets/js/sw.js', location.origin).href;
    navigator.serviceWorker.register(worker, { scope: '/' }).catch(() => { /* offline support is optional */ });
    // Older versions installed sw.js elsewhere (/sw.js, /html/sw.js); remove those.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => {
      const w = r.active || r.waiting || r.installing;
      if (w && w.scriptURL !== worker) r.unregister();
    })).catch(() => {});
  });
}

/* ---------- Install (add to Home Screen / Dock) ---------- */
/* Chrome, Edge, Brave, Samsung and Android browsers offer a native prompt (beforeinstallprompt;
   each page's <head> catches it early in window.__installPrompt). Safari on iPhone, iPad and Mac
   never does, so the button opens step-by-step instructions for the browser being used. */
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

/** Which install instructions fit this device and browser. */
export function installPlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0) {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 0); // iPadOS reports "Macintosh" (Macs have no touch)
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|SamsungBrowser/.test(ua);
  if (ios) return 'ios';
  if (/Macintosh/.test(ua) && safari) return 'mac-safari';
  if (android && /SamsungBrowser/.test(ua)) return 'samsung';
  if (android && firefox) return 'android-firefox';
  if (android) return 'android';
  if (firefox) return 'desktop-firefox';
  return 'desktop';
}

const INSTALL_STEPS = {
  ios: {
    title: 'Add mysabak to your Home Screen',
    steps: [`Tap the Share button ${icon('i-share', 'icon--inline')} (bottom of the screen on iPhone, top on iPad).`, 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. mysabak now opens from your Home Screen like an app.'],
    note: 'Works in Safari, and in Chrome or Edge on iOS 16.4 or later.',
  },
  'mac-safari': {
    title: 'Add mysabak to your Dock',
    steps: [`In the menu bar choose <b>File</b>, or click the Share button ${icon('i-share', 'icon--inline')}.`, 'Choose <b>Add to Dock</b>.', 'Click <b>Add</b>. mysabak opens from your Dock and Launchpad.'],
    note: 'Needs macOS Sonoma (Safari 17) or later. On older Macs, use Chrome, Edge or Brave.',
  },
  samsung: {
    title: 'Add mysabak to your Home screen',
    steps: ['Tap the menu ☰ at the bottom.', 'Tap <b>Add page to</b>, then <b>Home screen</b>.', 'Tap <b>Add</b>.'],
  },
  'android-firefox': {
    title: 'Add mysabak to your Home screen',
    steps: [`Tap the menu ${icon('i-menu-dots', 'icon--inline')}.`, 'Tap <b>Install</b> (or <b>Add to Home screen</b>).', 'Tap <b>Add</b>.'],
  },
  android: {
    title: 'Add mysabak to your Home screen',
    steps: [`Tap the browser menu ${icon('i-menu-dots', 'icon--inline')}.`, 'Tap <b>Install app</b> or <b>Add to Home screen</b>.', 'Tap <b>Install</b>.'],
  },
  'desktop-firefox': {
    title: 'Install mysabak',
    steps: ['Firefox on computers can’t install web apps yet.', 'Open this page in Chrome, Edge or Brave (or Safari on a Mac).', 'Click <b>Install app</b> again.'],
  },
  desktop: {
    title: 'Install mysabak',
    steps: ['Click the install icon at the right end of the address bar, or open the browser menu.', 'Choose <b>Install mysabak</b> (Chrome: <b>Cast, save and share → Install page</b>).', 'Click <b>Install</b>. mysabak opens in its own window.'],
    note: 'Already installed? Open it from your apps or Start menu.',
  },
};

function openInstallSheet() {
  const info = INSTALL_STEPS[installPlatform()];
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-labelledby', 'installTitle');
  dlg.innerHTML = `
    <form method="dialog" class="sheet__body">
      <span class="sheet__handle" aria-hidden="true"></span>
      <div class="install__head"><img src="/assets/images/icons/icon-192.png" alt="" width="56" height="56">
        <div><h2 class="sheet__title" id="installTitle">${info.title}</h2><p class="sheet__sub">Opens full screen, no app store needed.</p></div></div>
      <ol class="install__steps">${info.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${info.note ? `<p class="field__hint">${info.note}</p>` : ''}
      <button type="submit" class="button button--block">Got it</button>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

/** Wire an Install button: native prompt where the browser has one, instructions everywhere else. */
export function setupInstall(button) {
  if (!button) return;
  if (isInstalled()) { button.hidden = true; return; }
  button.hidden = false;
  window.addEventListener('appinstalled', () => { button.hidden = true; toast('mysabak is installed. Find it on your Home Screen or in your apps.'); });
  button.addEventListener('click', async () => {
    const prompt = installPrompt || window.__installPrompt;
    if (prompt) {
      installPrompt = null;
      window.__installPrompt = null;
      prompt.prompt();
      await prompt.userChoice.catch(() => {});
      return;
    }
    openInstallSheet();
  });
}

/** Show / hide buttons next to password fields: <button data-reveal="inputId">. */
export function wirePasswordReveal(root = document) {
  $$('[data-reveal]', root).forEach((btn) => btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.reveal);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  }));
}

/* ---------- Toast ---------- */
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('is-visible');
  void el.offsetWidth; // restart the entrance animation
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

export const when = (ts) => new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const params = () => new URLSearchParams(location.search);

/* ---------- Place search (address box with suggestions) ---------- */
/**
 * Turn an <input> + <ul> into an address search.
 * @param {{input:HTMLInputElement, list:HTMLUListElement, near:() => {lng,lat}, onPick:(place:{label,lng,lat}) => void}} opts
 */
export function placeSearch({ input, list, near, onPick }) {
  let timer = null;
  let ctrl = null;
  let items = [];
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const show = (html) => { list.innerHTML = html; list.hidden = false; input.setAttribute('aria-expanded', 'true'); };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 3) { close(); return; }
    timer = setTimeout(async () => {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      show('<li class="suggest__note">Searching…</li>');
      try {
        items = await searchPlaces(text, near(), { signal: ctrl.signal });
        if (input.value.trim() !== text) return;
        show(items.length
          ? items.map((p, i) => `<li class="suggest__item" role="option" data-index="${i}">${icon('i-pin')}<span class="suggest__text"><span class="suggest__title">${esc(p.title)}</span><span class="suggest__sub">${esc(p.subtitle)}</span></span></li>`).join('')
          : '<li class="suggest__note">No places found. Try another name.</li>');
      } catch (err) {
        if (err.name !== 'AbortError') show(`<li class="suggest__note">${esc(errorMessage(err))}</li>`);
      }
    }, 300);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', async (e) => {
    const li = e.target.closest('[data-index]');
    if (!li) return;
    const place = items[Number(li.dataset.index)];
    close();
    try {
      const loc = await placeLocation(place);
      input.value = place.title;
      onPick({ label: place.title, lng: loc.lng, lat: loc.lat });
    } catch (err) {
      toast(errorMessage(err));
    }
  });
}

/* ---------- Tip picker ---------- */
/**
 * Tip amount buttons (₱10 / ₱20 / ₱50 / Custom) + e-wallet/card choice, rendered into `root`.
 * Nothing is picked by default.
 * @returns {{amount:() => number, method:() => string|null, reset:() => void}}
 */
export function tipPicker(root, { onChange = () => {} } = {}) {
  const { presets, max, methods } = CONFIG.tips;
  const uid = Math.random().toString(36).slice(2, 7);
  root.classList.add('tip__picker');
  root.innerHTML = `
    <div class="tip__amounts" role="group" aria-label="Tip amount">
      ${presets.map((n) => `<button type="button" class="chip tip__amount" data-amount="${n}" aria-pressed="false">${peso(n)}</button>`).join('')}
      <button type="button" class="chip tip__amount" data-amount="custom" aria-pressed="false">Custom</button>
    </div>
    <label class="tip__custom" hidden>
      <span class="sr-only">Custom tip in pesos</span>
      <span class="tip__currency" aria-hidden="true">${CONFIG.currency}</span>
      <input type="number" inputmode="numeric" min="1" max="${max}" step="1" placeholder="Up to ${max}">
    </label>
    <fieldset class="tip__methods">
      <legend>Pay the tip with</legend>
      ${methods.map((m, i) => `<label class="pill-radio"><input type="radio" name="tipMethod-${uid}" value="${m.id}"${i === 0 ? ' checked' : ''}><span>${m.name}</span></label>`).join('')}
    </fieldset>`;
  let picked = null; // number, 'custom' or null
  const custom = $('.tip__custom', root);
  const customInput = $('input', custom);
  const buttons = $$('.tip__amount', root);

  const amount = () => (picked === 'custom' ? cleanTip(customInput.value, max) : cleanTip(picked, max));
  const paint = () => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(String(picked) === b.dataset.amount)));
    custom.hidden = picked !== 'custom';
    onChange(amount());
  };
  buttons.forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.amount === 'custom' ? 'custom' : Number(b.dataset.amount);
    picked = picked === v ? null : v; // tap again to un-pick
    paint();
    if (picked === 'custom') customInput.focus();
  }));
  customInput.addEventListener('input', () => {
    if (Number(customInput.value) > max) customInput.value = String(max);
    onChange(amount());
  });
  return {
    amount,
    method: () => ($('input[type="radio"]:checked', root) || {}).value || null,
    reset: () => { picked = null; customInput.value = ''; paint(); },
  };
}

/* ---------- Tip sheet (after a trip / delivery, or from a receipt) ---------- */
const TIP_NOTE = {
  ride: 'Your driver keeps 100% of the fare. Tips go to mysabak.',
  express: 'Your driver keeps 100% of the fare. Tips go to mysabak.',
  shop: 'The shop gets the item price and your rider keeps 100% of the delivery fee. Tips go to mysabak.',
};

/**
 * Show the "Tip mysabak" sheet.
 * @param {{orderId:string, orderType:'ride'|'express'|'shop', title:string, subtitle?:string,
 *   lines?:Array<{label:string, to:string, amount:string}>, demoNote?:string}} opts
 * @returns {Promise<{amount:number}|null>}  null = no tip
 */
export function openTipSheet({ orderId, orderType, title, subtitle = '', lines = [], demoNote = '' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.setAttribute('aria-labelledby', 'tipSheetTitle');
    dlg.innerHTML = `
      <form method="dialog" class="sheet__body">
        <span class="sheet__handle" aria-hidden="true"></span>
        <h2 class="sheet__title" id="tipSheetTitle">${esc(title)}</h2>
        ${subtitle ? `<p class="sheet__sub">${esc(subtitle)}</p>` : ''}
        ${demoNote ? `<p class="demo-note">${esc(demoNote)}</p>` : ''}
        ${lines.length ? `<dl class="receipt">${lines.map((l) => `<div class="receipt__row"><dt>${esc(l.label)}<span>${esc(l.to)}</span></dt><dd>${esc(l.amount)}</dd></div>`).join('')}</dl>` : ''}
        <section class="tip" aria-labelledby="tipHead">
          <h3 class="tip__head" id="tipHead">Tip mysabak <span>· keeps rides fee-free for drivers</span></h3>
          <div data-picker></div>
          <p class="tip__note">${icon('i-shield', 'icon--sm')}${esc(TIP_NOTE[orderType] || TIP_NOTE.ride)}</p>
        </section>
        <div class="sheet__actions">
          <button type="button" class="button button--ghost" data-skip>No tip</button>
          <button type="button" class="button" data-send disabled>Tip</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const send = $('[data-send]', dlg);
    const picker = tipPicker($('[data-picker]', dlg), {
      onChange: (n) => { send.disabled = !n; send.textContent = n ? `Tip ${peso(n)}` : 'Tip'; },
    });
    const done = (result) => {
      dlg.close();
      dlg.remove();
      resolve(result);
    };
    $('[data-skip]', dlg).addEventListener('click', () => done(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    send.addEventListener('click', async () => {
      const amount = picker.amount();
      if (!amount) return;
      send.disabled = true;
      send.textContent = 'Sending…';
      try {
        await sendTip({ orderId, orderType, amount, method: picker.method() });
        toast(`Thank you! Your ${peso(amount)} tip keeps mysabak fee-free for drivers.`);
        done({ amount });
      } catch (err) {
        toast(err.status === 400 ? err.message : errorMessage(err));
        send.disabled = false;
        send.textContent = `Tip ${peso(amount)}`;
      }
    });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
}
