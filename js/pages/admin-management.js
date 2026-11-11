/* Admin management (pages/admin-management.html): every rider, driver and merchant account in one searchable table,
   one account's profile (edit details, send a password reset, turn the account off or back on), the sign-up links to
   share, and how registrations are going. ?id= opens one account. */
import { adminUsers, adminUpdateUser, adminSetUserStatus, adminPasswordReset, adminApplications, errorMessage } from '../api.js';
import { $, esc, icon, toast, rollNumber, ava, pager } from '../ui.js';
import { mountAdmin, ACCOUNT, ROLE, STATUS, VEHICLE, since, day, num, tag, notice, wireTips } from './admin-common.js';

const ROLES = [['', 'All'], ['rider', 'Riders'], ['driver', 'Drivers'], ['merchant', 'Merchants']];
const OFF_REASONS = ['Asked to close their account', 'Repeated complaints from riders', 'Fake or duplicate account', 'Papers expired', 'Payment problems'];
const AREA_WORD = { rider: 'Area', driver: 'City', merchant: 'Area' };

const params = new URLSearchParams(location.search);
const PER = 6; // accounts on a page
const state = { users: [], apps: { drivers: [], merchants: [] }, q: '', role: '', status: '', page: 1, sel: params.get('id'), open: Boolean(params.get('id')), mode: 'view', errors: {}, busy: false };

mountAdmin().then((user) => {
  if (!user) return;
  $('#mgmtPage').hidden = false;
  wireTips($('#mgmtPage'));
  renderLinks();
  load();
});

async function load() {
  try {
    const [users, drivers, merchants] = await Promise.all([adminUsers(), adminApplications('drivers'), adminApplications('merchants')]);
    Object.assign(state, { users, apps: { drivers, merchants } });
    render();
    renderActivity();
  } catch (err) {
    toast(errorMessage(err));
  }
}

const label = (u) => (u.role === 'merchant' && u.shop ? u.shop : u.name);
const subLabel = (u) => (u.role === 'merchant' && u.shop ? `${u.name} · ${u.email}` : u.email);
const resetPage = () => { state.page = 1; };
const matches = (u) => {
  if (state.role && u.role !== state.role) return false;
  if (state.status && u.status !== state.status) return false;
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return [u.name, u.shop, u.email, u.area].some((x) => x && x.toLowerCase().includes(q)) || (digits.length >= 3 && u.phone.includes(digits));
};
// waiting accounts first (a stable sort: newest first within each group)
const shown = () => state.users.filter(matches).sort((a, b) => (b.status === 'pending') - (a.status === 'pending'));
const current = () => state.users.find((u) => u.id === state.sel) || (state.open ? null : shown()[0]) || null;

function render() {
  history.replaceState(null, '', state.open && state.sel ? `?id=${encodeURIComponent(state.sel)}` : location.pathname);
  $('#roles').innerHTML = ROLES.map(([id, name]) => {
    const n = state.users.filter((u) => !id || u.role === id).length;
    return `<button type="button" class="seg__btn" data-role="${id}" aria-pressed="${state.role === id}"><span>${name}</span><span class="seg__n">${n}</span></button>`;
  }).join('');
  renderTiles();
  const list = shown();
  const cur = current();
  $('#ucount').textContent = list.length === state.users.length ? `${num(list.length)} accounts, pending first` : `Showing ${num(list.length)} of ${num(state.users.length)} accounts`;
  // one page of the list (waiting first), split into its groups
  const waitAll = list.filter((u) => u.status === 'pending');
  const otherAll = list.filter((u) => u.status !== 'pending');
  state.page = Math.min(state.page, Math.max(1, Math.ceil(list.length / PER)));
  const rows = list.slice((state.page - 1) * PER, state.page * PER);
  $('#upages').innerHTML = pager(state.page, list.length, PER, 'accounts');
  // Who needs a decision first, with a Review button; everyone else quiet below
  const row = (u, i) => {
    const pending = u.status === 'pending';
    const end = pending ? `<a class="urow__go" href="/pages/admin-registrations.html?kind=${u.application.kind}&tab=${u.application.status}&id=${encodeURIComponent(u.id)}">Review</a>`
      : u.status === 'deactivated' ? tag('rejected', 'Turned off') : icon('i-chevron', 'urow__chev');
    return `<li class="urow" style="--i:${Math.min(i, 8)}" aria-current="${Boolean(cur && cur.id === u.id)}">${ava(label(u))}
      <span class="row__main"><button type="button" class="ulink row__title" data-id="${esc(u.id)}">${esc(label(u))}</button><span class="row__sub">${esc(subLabel(u))}</span></span>
      <span class="urow__meta"><span>${ROLE[u.role]} · ${esc(u.area)}</span><span>${esc(since(u.lastActiveAt))}</span></span>
      <span class="urow__end">${end}</span></li>`;
  };
  const group = (title, aside, members) => (members.length ? `<section class="ugroup"><h3 class="ugroup__head"><span>${title}</span><span>${aside}</span></h3><ul class="ugroup__list">${members.map(row).join('')}</ul></section>` : '');
  const waiting = rows.filter((u) => u.status === 'pending');
  const others = rows.filter((u) => u.status !== 'pending');
  const waitN = waitAll.length;
  const otherN = otherAll.length;
  const otherTitle = state.status === 'active' ? 'Active' : state.status === 'deactivated' ? 'Turned off' : 'Everyone else';
  $('#urows').innerHTML = rows.length ? group('Needs your review', `${num(waitN)} pending`, waiting) + group(otherTitle, `${num(otherN)} account${otherN === 1 ? '' : 's'}`, others)
    : `<p class="empty ugroup__empty">No accounts match. <button type="button" class="ulink card__link" data-clear>Clear the search</button></p>`;
  $('#urows').classList.toggle('is-first', !state.drawn); // rows rise in on the first draw only, not on every filter
  state.drawn = true;
  $('#mgmt').classList.toggle('is-open', state.open && Boolean(cur));
  renderProfile(cur);
}

function renderProfile(u) {
  const box = $('#uprof');
  box.hidden = !u;
  if (!u) return;
  const st = ACCOUNT[u.status];
  const facts = [
    ['Email', u.email, true], ['Mobile', u.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')], [AREA_WORD[u.role], u.area],
    ['Joined', day(u.joinedAt)], ['Last active', since(u.lastActiveAt)],
    ...(u.role === 'driver' ? [['Vehicle', `${VEHICLE[u.vehicle] || u.vehicle || '—'} · ${u.plate || '—'}`], ['Trips done', num(u.trips)]] : []),
    ...(u.role === 'merchant' ? [['Owner', u.name], ['Orders', num(u.trips)]] : []),
    ...(u.role === 'rider' ? [['Trips taken', num(u.trips)]] : []),
  ];
  const back = `<button type="button" class="back" data-back>${icon('i-back')}All accounts</button>`;
  const head = `<div class="review__head">
      ${ava(label(u), 'ava--lg')}
      <div class="review__who"><h2 class="review__name">${esc(label(u))}</h2>
        <p class="review__meta">${ROLE[u.role]}${u.demoLogin ? ' · demo login' : ''}</p></div>
      ${tag(st.tag, st.label)}</div>`;

  if (state.mode === 'edit') {
    const e = state.errors;
    const field = (id, name, value, type, extra = '') => `<div class="afield"><label class="afield__label" for="f-${id}">${name}</label>
      <input class="input" id="f-${id}" name="${id}" type="${type}" value="${esc(value)}"${e[id] ? ` aria-invalid="true" aria-describedby="e-${id}"` : ''} ${extra}>
      ${e[id] ? `<p class="field__error" id="e-${id}">${esc(e[id])}</p>` : ''}</div>`;
    box.innerHTML = `${back}${head}
      <form class="uform" id="uform" novalidate>
        <h3 class="subtitle">Edit details</h3>
        ${field('name', u.role === 'merchant' ? 'Owner’s name' : 'Name', u.name, 'text', 'autocomplete="off" required')}
        ${field('email', 'Email', u.email, 'email', 'autocomplete="off" required')}
        ${field('phone', 'Mobile number', u.phone, 'tel', 'inputmode="tel" autocomplete="off" placeholder="0917 123 4567" required')}
        ${field('area', AREA_WORD[u.role], u.area, 'text', 'autocomplete="off" required')}
        ${e.form ? `<p class="field__error" role="alert">${esc(e.form)}</p>` : ''}
        <div class="actions"><button type="submit" class="button cta"${state.busy ? ' disabled' : ''}>${state.busy ? 'Saving…' : 'Save changes'}</button>
          <button type="button" class="button button--ghost cta" data-cancel>Cancel</button></div>
      </form>`;
    return;
  }

  const offNote = u.status === 'deactivated' ? notice('rejected', `<b>Turned off${u.statusAt ? ` on ${day(u.statusAt)}` : ''}.</b> Reason: ${esc(u.reason)}. They can’t sign in until you turn the account back on.`) : '';
  const pendingNote = u.status === 'pending' ? notice('review', u.application.status === 'fix' ? `<b>Changes requested.</b> They’re fixing their papers. You can manage this account once their ${u.role === 'driver' ? 'driver' : 'shop'} application is approved.` : `<b>Pending review.</b> Approve their ${u.role === 'driver' ? 'driver' : 'shop'} application first, then you can manage this account.`) : '';
  let actions = '';
  if (u.status === 'pending') {
    actions = `<a class="button cta" href="/pages/admin-registrations.html?kind=${u.application.kind}&tab=${u.application.status}&id=${encodeURIComponent(u.id)}">Review application</a>`;
  } else if (state.mode === 'off') {
    actions = `<div class="confirm">
      <div class="afield"><label class="afield__label" for="offReason">Why are you turning this account off?</label>
        <select class="select" id="offReason">${OFF_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
        <span class="afield__hint">Kept on the account so other admins can see why.</span></div>
      <p>${esc(label(u))} will be signed out and can’t sign in${u.role === 'driver' ? ' or take trips' : u.role === 'merchant' ? ' or take orders' : ' or book'} until you turn it back on.</p>
      <div class="actions"><button type="button" class="button button--danger-solid cta" data-confirm-off${state.busy ? ' disabled' : ''}>Turn off account</button>
        <button type="button" class="button button--ghost cta" data-cancel>Cancel</button></div></div>`;
  } else {
    actions = `<div class="actions">
      <button type="button" class="button button--ghost cta" data-edit>${icon('i-pencil')}Edit details</button>
      ${u.status === 'active' ? `<button type="button" class="button button--ghost cta" data-reset>Send password reset</button>
        <button type="button" class="button button--danger cta" data-off>Turn off</button>`
    : `<button type="button" class="button cta" data-on${state.busy ? ' disabled' : ''}>Turn account back on</button>`}</div>`;
  }
  box.innerHTML = `${back}${head}${offNote}${pendingNote}
    <dl class="facts">${facts.map(([dt, dd, wide]) => `<div${wide ? ' class="span-2"' : ''}><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`).join('')}</dl>
    ${actions}`;
}

/* ---------- Sign-up links ---------- */
function renderLinks() {
  const base = location.origin;
  const links = [
    { id: 'driver', name: 'Drivers', url: `${base}/pages/drive-signup.html`, note: 'Opens the driver application. New applications show up in Registrations.', ready: true },
    { id: 'merchant', name: 'Shops', url: `${base}/pages/merchant.html`, note: 'Opens the merchant page. The partner sign-up form is still being built.', ready: false },
    { id: 'rider', name: 'Riders', url: `${base}/pages/account.html`, note: 'Opens the customer sign-in page. Customer sign-up is still being built.', ready: false },
  ];
  const canShare = typeof navigator.share === 'function';
  $('#links').innerHTML = links.map((l) => `<li class="slink">
      <div class="slink__top"><span class="slink__name">${l.name}</span>${l.ready ? tag('approved', 'Live') : tag('review', 'Coming soon')}</div>
      <p class="slink__note">${l.note}</p>
      <div class="slink__row"><label class="sr-only" for="link-${l.id}">${l.name} sign-up link</label>
        <input class="input" id="link-${l.id}" type="text" value="${esc(l.url)}" readonly>
        <button type="button" class="button button--ghost cta slink__copy" data-copy="${l.id}" aria-label="Copy the ${l.name.toLowerCase()} link"><span>Copy</span>${icon('i-copy')}</button>
        ${canShare ? `<button type="button" class="button button--ghost cta" data-share="${l.id}" aria-label="Share the ${l.name.toLowerCase()} link">${icon('i-share')}</button>` : ''}</div></li>`).join('');
  $('#links').addEventListener('focusin', (e) => { if (e.target.matches('input[readonly]')) e.target.select(); });
  $('#links').addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    const s = e.target.closest('[data-share]');
    if (c) {
      const input = $(`#link-${c.dataset.copy}`);
      try { await navigator.clipboard.writeText(input.value); } catch (_) { input.select(); document.execCommand('copy'); }
      const word = c.querySelector('span');
      const glyph = c.querySelector('use');
      const was = glyph.getAttribute('href');
      word.textContent = 'Copied';
      glyph.setAttribute('href', was.replace('i-copy', 'i-check'));
      toast('Link copied. Paste it in a message or post.');
      setTimeout(() => { word.textContent = 'Copy'; glyph.setAttribute('href', was); }, 2000);
    }
    if (s) {
      const l = links.find((x) => x.id === s.dataset.share);
      navigator.share({ title: `Join mysabak: ${l.name.toLowerCase()}`, url: l.url }).catch(() => { /* closed */ });
    }
  });
}

/* ---------- Registration activity ---------- */
function renderActivity() {
  const kinds = [['drivers', 'Drivers'], ['merchants', 'Shops']];
  const cols = ['review', 'fix', 'approved', 'rejected'];
  $('#activity').innerHTML = `<thead><tr><th>Applicants</th>${cols.map((c) => `<th class="num">${STATUS[c].short}</th>`).join('')}</tr></thead>
    <tbody>${kinds.map(([k, name]) => `<tr><td>${name}</td>${cols.map((c) => {
    const n = state.apps[k].filter((a) => a.status === c).length;
    return `<td class="num">${n ? `<a href="/pages/admin-registrations.html?kind=${k}&tab=${c}" data-tip="${esc(`${name}: ${STATUS[c].label}|${n} ${n === 1 ? 'applicant' : 'applicants'}. Open the list`)}">${n}</a>` : '<span class="muted">0</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody>`;
  const week = state.users.filter((u) => Date.now() - u.joinedAt < 7 * 86400e3);
  const waiting = state.users.filter((u) => u.status === 'pending').length;
  $('#actLine').textContent = `${week.length} new sign-ups this week · ${waiting} pending review.`;
  $('#newest').innerHTML = state.users.slice(0, 4).map((u) => `<li><button type="button" class="waitrow ulink-row" data-id="${esc(u.id)}">
      ${ava(label(u))}
      <span class="row__main"><span class="row__title">${esc(label(u))}</span><span class="row__sub">${ROLE[u.role]} · joined ${esc(since(u.joinedAt))}</span></span>
      ${tag(ACCOUNT[u.status].tag, ACCOUNT[u.status].label)}</button></li>`).join('');
}

/* ---------- Events ---------- */
const pick = (id) => {
  Object.assign(state, { sel: id, open: true, mode: 'view', errors: {} });
  render();
  if (matchMedia('(max-width: 1099px)').matches) $('.content').scrollTo({ top: 0, behavior: 'smooth' });
  else $('#uprof').focus({ preventScroll: true });
};
$('#uprof').tabIndex = -1;

let typing;
$('#q').addEventListener('input', (e) => {
  clearTimeout(typing);
  typing = setTimeout(() => { Object.assign(state, { q: e.target.value, open: false, sel: null, mode: 'view' }); resetPage(); render(); }, 120);
});
const TILES = [['', 'All accounts'], ['pending', 'Pending review'], ['active', 'Active'], ['deactivated', 'Turned off']];
// Drawn once and then only updated, so the tiles don't rise in again on every filter
function renderTiles() {
  const host = $('#stiles');
  if (!host.children.length) host.innerHTML = TILES.map(([id, name]) => `<button type="button" class="stile" data-status="${id}"><b></b><span>${name}</span></button>`).join('');
  [...host.children].forEach((t) => {
    const n = num(state.users.filter((u) => (!state.role || u.role === state.role) && (!t.dataset.status || u.status === t.dataset.status)).length);
    t.setAttribute('aria-pressed', String(state.status === t.dataset.status));
    const b = t.firstChild;
    if (b.dataset.value === n) return;
    const from = b.dataset.value ?? null;
    b.textContent = n;
    rollNumber(b, from);
  });
}
$('#stiles').addEventListener('click', (e) => {
  const t = e.target.closest('[data-status]');
  if (t && t.dataset.status !== state.status) { Object.assign(state, { status: t.dataset.status, open: false, sel: null, mode: 'view' }); resetPage(); render(); }
});
$('#roles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-role]');
  if (b) { Object.assign(state, { role: b.dataset.role, open: false, sel: null, mode: 'view' }); resetPage(); render(); }
});
$('#urows').addEventListener('click', (e) => {
  if (e.target.closest('[data-clear]')) {
    Object.assign(state, { q: '', role: '', status: '' });
    $('#q').value = '';
    render();
    return;
  }
  const b = e.target.closest('[data-id]');
  if (b) pick(b.dataset.id);
});
$('#upages').addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (!b || b.disabled) return;
  state.page = Number(b.dataset.page);
  render();
  $('#usersTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#upages [aria-current="page"]').focus({ preventScroll: true });
});
$('#newest').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  Object.assign(state, { q: '', role: '', status: '' });
  $('#q').value = '';
  state.page = Math.floor(shown().findIndex((u) => u.id === b.dataset.id) / PER) + 1; // the page it's on
  pick(b.dataset.id);
  $('#mgmt').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/** Run an account change, then reload the list and keep the account open. */
async function change(run, done) {
  const u = current();
  state.busy = true;
  renderProfile(u);
  try {
    await run(u);
    state.users = await adminUsers();
    Object.assign(state, { sel: u.id, mode: 'view', errors: {} });
    if (done) toast(done(u));
  } catch (err) {
    if (err.field) state.errors = { [err.field]: err.message };
    else if (err.status === 400 || err.status === 409) state.errors = { form: err.message };
    else toast(errorMessage(err));
  } finally {
    state.busy = false;
    render();
    renderActivity();
  }
}

$('#uprof').addEventListener('click', async (e) => {
  const u = current();
  if (!u) return;
  if (e.target.closest('[data-back]')) { Object.assign(state, { open: false, mode: 'view' }); render(); return; }
  if (e.target.closest('[data-edit]')) { Object.assign(state, { mode: 'edit', errors: {} }); renderProfile(u); $('#f-name').focus(); return; }
  if (e.target.closest('[data-off]')) { state.mode = 'off'; renderProfile(u); $('#offReason').focus(); return; }
  if (e.target.closest('[data-cancel]')) { Object.assign(state, { mode: 'view', errors: {} }); renderProfile(u); return; }
  if (e.target.closest('[data-confirm-off]')) {
    const reason = $('#offReason').value;
    await change((x) => adminSetUserStatus({ id: x.id, status: 'deactivated', reason }), (x) => `${label(x)} is turned off.`);
    return;
  }
  if (e.target.closest('[data-on]')) {
    await change((x) => adminSetUserStatus({ id: x.id, status: 'active' }), (x) => `${label(x)} can sign in again.`);
    return;
  }
  const r = e.target.closest('[data-reset]');
  if (r) {
    r.disabled = true;
    r.textContent = 'Sending…';
    try {
      const { sentTo } = await adminPasswordReset(u.id);
      toast(`Password reset link sent to ${sentTo}.`);
    } catch (err) {
      toast(err.status === 409 ? err.message : errorMessage(err));
    }
    r.disabled = false;
    r.textContent = 'Send password reset';
  }
});

$('#uprof').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const input = Object.fromEntries(['name', 'email', 'phone', 'area'].map((k) => [k, String(f.get(k) || '')]));
  const keep = { ...current(), ...input };
  await change((x) => adminUpdateUser({ id: x.id, ...input }), (x) => `Saved ${label({ ...x, ...input })}’s details.`);
  // a failed save keeps what they typed
  if (Object.keys(state.errors).length) {
    state.mode = 'edit';
    renderProfile(keep);
    const bad = $('[aria-invalid="true"]', $('#uprof'));
    if (bad) bad.focus();
  }
});
