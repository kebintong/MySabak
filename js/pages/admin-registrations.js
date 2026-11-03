/* Admin registrations (pages/admin-registrations.html): driver and shop applications. Pick one, look at the
   papers, tick the three checks, then approve, send back to fix (with a reason), or reject.
   ?kind=drivers|merchants picks the list and &id= opens one applicant. */
import { adminApplications, adminDecide, errorMessage } from '../api.js';
import { $, $$, esc, icon, toast, edgeGlow } from '../ui.js';
import { mountAdmin, STATUS, VEHICLE, VEHICLE_ART, initials, ago } from './admin-common.js';

const KINDS = {
  drivers: {
    label: 'Drivers', icon: 'i-wheel', approve: 'Approve driver', live: 'can go online now',
    intro: 'Check each driver’s papers, then approve, send back to fix, or reject. They get an email either way.',
    checks: ['Name and photo match the license', 'Plate and model match the OR/CR', 'The selfie is the same person as the license'],
    reasons: ['The OR/CR photo is missing or unreadable', 'The selfie doesn’t clearly show your face', 'The license is expired', 'The plate doesn’t match the OR/CR'],
  },
  merchants: {
    label: 'Merchants', icon: 'i-store', approve: 'Approve shop', live: 'is live on mysabak now',
    intro: 'Check each shop’s papers and photos, then approve, send back to fix, or reject. The owner gets an email either way.',
    checks: ['The owner’s name matches their ID', 'The permit matches the shop name and address', 'The shop photo shows a real storefront'],
    reasons: ['The business permit is missing or expired', 'The owner’s ID is unreadable', 'The shop photo doesn’t show the storefront', 'The address doesn’t match the permit'],
  },
};
const TABS = ['review', 'fix', 'approved', 'rejected'];
const PAPER = { clear: '✓ Clear', unclear: '… Unclear', missing: '✕ Missing', unknown: 'Not kept in the demo' };

const params = new URLSearchParams(location.search);
const state = {
  kind: KINDS[params.get('kind')] ? params.get('kind') : 'drivers',
  tab: 'review', sel: params.get('id'), open: Boolean(params.get('id')),
  lists: { drivers: [], merchants: [] }, checks: {}, fixOpen: false, done: null,
};

mountAdmin().then((user) => {
  if (!user) return;
  $('#regPage').hidden = false;
  load();
});

async function load() {
  try {
    const [drivers, merchants] = await Promise.all([adminApplications('drivers'), adminApplications('merchants')]);
    state.lists = { drivers, merchants };
    const picked = current();
    if (picked && state.open) state.tab = picked.status; // opened from a link: show it in its own tab
    render();
  } catch (err) {
    toast(errorMessage(err));
  }
}

const list = () => state.lists[state.kind];
const shown = () => list().filter((a) => a.status === state.tab);
/** The applicant on screen: the picked one, else the first in the tab. */
const current = () => list().find((a) => a.id === state.sel) || shown()[0] || null;
const nameOf = (a) => (a.kind === 'drivers' ? a.name : a.shop);

function render() {
  const k = KINDS[state.kind];
  history.replaceState(null, '', `?kind=${state.kind}${state.open && state.sel ? `&id=${encodeURIComponent(state.sel)}` : ''}`);
  $('#intro').textContent = k.intro;
  $('#kinds').innerHTML = Object.entries(KINDS).map(([id, x]) => {
    const n = state.lists[id].filter((a) => a.status === 'review').length;
    return `<a class="role-switch__btn" href="?kind=${id}" data-kind="${id}"${id === state.kind ? ' aria-current="page"' : ''}>${icon(x.icon)}${x.label} <span class="kind-n">${n}</span></a>`;
  }).join('');
  $('#stabs').innerHTML = TABS.map((t) => {
    const n = list().filter((a) => a.status === t).length;
    return `<button type="button" class="stab" role="tab" data-tab="${t}" aria-selected="${t === state.tab}">${STATUS[t].label} · ${n}</button>`;
  }).join('');
  const cur = current();
  $('#rows').innerHTML = shown().length ? shown().map((a) => `<li><button type="button" class="regrow" data-id="${esc(a.id)}" aria-current="${Boolean(cur && cur.id === a.id)}">
      <img class="regrow__art" src="${a.kind === 'drivers' ? VEHICLE_ART[a.vehicle] || VEHICLE_ART.sedan : '/assets/images/3d/food.webp'}" alt="" width="52" height="36">
      <span class="row__main"><span class="row__title">${esc(nameOf(a))}</span>
        <span class="row__sub">${esc(a.kind === 'drivers' ? VEHICLE[a.vehicle] || a.vehicle : a.category)} · ${esc(a.kind === 'drivers' ? a.city : a.area)} · ${esc(ago(a.appliedAt))}</span></span>
      ${a.sample ? '<span class="tag tag--sample">Sample</span>' : ''}</button></li>`).join('')
    : '<li class="empty">Nothing here right now.</li>';
  $('#reg').classList.toggle('is-reviewing', state.open && Boolean(cur));
  renderReview(cur);
}

function renderReview(a) {
  const box = $('#review');
  box.hidden = !a;
  if (!a) return;
  const k = KINDS[state.kind];
  const ticked = state.checks[a.id] || [false, false, false];
  const allTicked = ticked.every(Boolean);
  const facts = a.kind === 'drivers'
    ? [['Vehicle', VEHICLE[a.vehicle] || a.vehicle], ['Model · year', `${a.model} · ${a.year}`], ['Plate', a.plate], ['License no.', a.licenseNumber]]
    : [['Category', a.category], ['Owner', a.owner], ['Address', a.address], ['Products', a.products], ['Registered as', a.registeredAs]];
  const papers = a.kind === 'drivers'
    ? [['License', a.papers.license], ['OR/CR', a.papers.orcr], ['Selfie', a.papers.selfie]]
    : [[a.registeredAs === 'SEC' ? 'SEC papers' : 'DTI papers', a.papers.registration], ['Business permit', a.papers.permit], ['Owner’s ID', a.papers.ownerId], ['Shop photo', a.papers.shopPhoto]];
  const canDecide = a.status === 'review' || a.status === 'fix';
  const done = state.done && state.done.id === a.id ? state.done : null;
  box.innerHTML = `
    <button type="button" class="review__back" data-back>${icon('i-back')}All ${k.label.toLowerCase()}</button>
    <div class="review__head">
      <span class="review__ava" aria-hidden="true">${esc(initials(nameOf(a)))}</span>
      <div class="review__who">
        <h2 class="review__name">${esc(nameOf(a))}</h2>
        <p class="review__meta">Applied ${esc(ago(a.appliedAt))} ago · ${esc(a.phone)} · ${esc(a.email)}</p>
      </div>
      <span class="tag tag--${a.status}">${STATUS[a.status].icon} ${STATUS[a.status].label}</span>
    </div>
    ${a.status === 'fix' && a.reason && !done ? `<p class="notice notice--fix">Sent back: “${esc(a.reason)}”</p>` : ''}
    <div class="facts">
      <img src="${a.kind === 'drivers' ? VEHICLE_ART[a.vehicle] || VEHICLE_ART.sedan : '/assets/images/3d/food.webp'}" alt="" width="110" height="70">
      <dl>${facts.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`).join('')}</dl>
    </div>
    <section aria-label="Papers">
      <h3 class="card__title">Papers</h3>
      <div class="papers">${papers.map(([name, st]) => `<figure class="paper">
        <div class="paper__img">${a.sample ? 'Sample: no photo' : `Photo of ${esc(name)}`}</div>
        <figcaption><strong>${esc(name)}</strong><span class="state--${st}">${PAPER[st] || st}</span></figcaption></figure>`).join('')}</div>
    </section>
    ${canDecide && !done ? `
      <fieldset class="checks"><legend>Before approving, check</legend>
        ${k.checks.map((c, i) => `<label><input type="checkbox" data-check="${i}"${ticked[i] ? ' checked' : ''}>${esc(c)}</label>`).join('')}
      </fieldset>
      ${state.fixOpen ? `<label class="fixwhy">What needs fixing (sent to the applicant)
        <select id="fixReason">${k.reasons.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>` : ''}
      <div class="actions">
        <button type="button" class="button button--gold cta" data-decide="approved"${allTicked ? '' : ' disabled'}>${k.approve}</button>
        <button type="button" class="button cta" data-decide="fix">${state.fixOpen ? 'Send back to fix' : 'Ask to fix papers'}</button>
        <button type="button" class="button button--danger cta" data-decide="rejected">Reject</button>
        <span class="actions__hint">${allTicked ? 'Ready to approve.' : 'Tick all three checks to approve.'}</span>
      </div>` : ''}
    ${done ? `<p class="notice notice--${done.status}" role="status">${esc(done.text)}</p>` : ''}`;
}

$('#stabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  Object.assign(state, { tab: b.dataset.tab, sel: null, open: false, fixOpen: false, done: null });
  render();
});

$('#kinds').addEventListener('click', (e) => {
  const a = e.target.closest('[data-kind]');
  if (!a) return;
  e.preventDefault();
  Object.assign(state, { kind: a.dataset.kind, tab: 'review', sel: null, open: false, fixOpen: false, done: null });
  render();
});

$('#rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  Object.assign(state, { sel: b.dataset.id, open: true, fixOpen: false, done: null });
  render();
  if (matchMedia('(max-width: 899px)').matches) $('.content').scrollTo({ top: 0 });
});

$('#review').addEventListener('change', (e) => {
  const c = e.target.closest('[data-check]');
  const a = current();
  if (!c || !a) return;
  const next = (state.checks[a.id] || [false, false, false]).slice();
  next[Number(c.dataset.check)] = c.checked;
  state.checks[a.id] = next;
  renderReview(a);
});

$('#review').addEventListener('click', async (e) => {
  if (e.target.closest('[data-back]')) { Object.assign(state, { open: false, fixOpen: false }); render(); return; }
  const b = e.target.closest('[data-decide]');
  const a = current();
  if (!b || !a) return;
  const decision = b.dataset.decide;
  if (decision === 'fix' && !state.fixOpen) { state.fixOpen = true; renderReview(a); $('#fixReason').focus(); return; }
  const reason = decision === 'fix' ? $('#fixReason').value : '';
  $$('#review button').forEach((x) => { x.disabled = true; });
  try {
    await adminDecide({ kind: a.kind, id: a.id, decision, reason });
    const k = KINDS[a.kind];
    const text = decision === 'approved' ? `Approved. ${nameOf(a)} ${k.live}.`
      : decision === 'fix' ? `Sent back: “${reason}”. They can upload again.` : `Rejected. ${nameOf(a)} will be told why.`;
    if (decision === 'approved') edgeGlow('reward', b);
    // the decided applicant stays open with its confirmation until another is picked
    Object.assign(state, { sel: a.id, fixOpen: false, done: { id: a.id, status: decision, text } });
    state.lists[a.kind] = await adminApplications(a.kind);
    render();
  } catch (err) {
    toast(errorMessage(err));
    renderReview(a);
  }
});
