/* Admin registrations (pages/admin-registrations.html): driver and shop applications. Pick one, look at the
   papers, tick the three checks, then approve, send back to fix (with a reason), or reject.
   ?kind=drivers|merchants picks the list, &tab=review|fix|approved|rejected the status and &id= opens one applicant. */
import { adminApplications, adminDecide, errorMessage } from '../api.js';
import { $, $$, esc, icon, toast, edgeGlow, calm, ava, emptyRows } from '../ui.js';
import { mountAdmin, STATUS, VEHICLE, ago, since, tag, notice, openSheet } from './admin-common.js';

const KINDS = {
  drivers: {
    label: 'Drivers', icon: 'i-wheel', approve: 'Approve driver', live: 'can go online now',
    intro: 'Review each driver’s papers, then approve, ask for changes, or reject. They’re emailed either way.',
    checks: ['Name and photo match the license', 'Plate and model match the OR/CR', 'The selfie is the same person as the license'],
    reasons: ['The OR/CR photo is missing or unreadable', 'The selfie doesn’t clearly show your face', 'The license is expired', 'The plate doesn’t match the OR/CR'],
  },
  merchants: {
    label: 'Merchants', icon: 'i-store', approve: 'Approve shop', live: 'is live on mysabak now',
    intro: 'Review each shop’s papers and photos, then approve, ask for changes, or reject. The owner is emailed either way.',
    checks: ['The owner’s name matches their ID', 'The permit matches the shop name and address', 'The shop photo shows a real storefront'],
    reasons: ['The business permit is missing or expired', 'The owner’s ID is unreadable', 'The shop photo doesn’t show the storefront', 'The address doesn’t match the permit'],
  },
};
const TABS = ['review', 'fix', 'approved', 'rejected'];
// What to look for on each paper, and the fix reason to suggest when it isn't clear
const PAPER_HELP = {
  License: { look: ['The name matches the application', 'The photo is the applicant', 'It hasn’t expired'], reason: 2 },
  'OR/CR': { look: ['The plate matches', 'The make, model and year match', 'The registration is current'], reason: 0 },
  Selfie: { look: ['The face is clear, no sunglasses or mask', 'It’s the same person as on the license'], reason: 1 },
  'DTI papers': { look: ['The business name matches the shop name', 'The owner’s name matches their ID'], reason: 0 },
  'SEC papers': { look: ['The company name matches the shop name', 'The owner is listed as an officer'], reason: 0 },
  'Business permit': { look: ['It’s for this year', 'The address matches the shop'], reason: 0 },
  'Owner’s ID': { look: ['The name matches the owner', 'The photo and text are readable'], reason: 1 },
  'Shop photo': { look: ['It shows a real storefront', 'The sign matches the shop name'], reason: 2 },
};
const PAPER_SAYS = {
  clear: 'Readable, and the details match the application.',
  unclear: 'Hard to read. Look closely, or ask them for a sharper photo.',
  missing: 'Not uploaded. Ask them to add it before you approve.',
  unknown: 'Photos uploaded in this browser aren’t saved in the demo.',
};
const PAPER = { clear: 'Clear', unclear: 'Unclear', missing: 'Missing', unknown: 'Not saved' };
const PAPER_TAG = { clear: 'approved', unclear: 'review', missing: 'fix', unknown: 'rejected' };
/** A faint drawing of a paper (a photo box and a few lines), shown where its photo would be. */
const DRAWING = '<span class="pdraw" aria-hidden="true"><span></span><span><i></i><i></i><i></i><i></i></span></span>';
/** What an empty status tab says. */
const EMPTY = {
  review: () => ['All caught up', 'New applications show up here.'],
  fix: () => ['No requests out', 'Applicants you ask for changes show up here.'],
  approved: (k) => [`No approved ${k} yet`, `${k[0].toUpperCase()}${k.slice(1)} you approve show up here.`],
  rejected: (k) => [`No rejected ${k}`, `${k[0].toUpperCase()}${k.slice(1)} you reject show up here, with the reason.`],
};

const params = new URLSearchParams(location.search);
const state = {
  kind: KINDS[params.get('kind')] ? params.get('kind') : 'drivers',
  tab: TABS.includes(params.get('tab')) ? params.get('tab') : 'review', sel: params.get('id'), open: Boolean(params.get('id')),
  lists: { drivers: [], merchants: [] }, checks: {}, fixOpen: false, fixPick: 0, fixNote: '', done: null, paper: 0, drawn: false,
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
  history.replaceState(null, '', `?kind=${state.kind}${state.tab !== 'review' ? `&tab=${state.tab}` : ''}${state.open && state.sel ? `&id=${encodeURIComponent(state.sel)}` : ''}`);
  $('#intro').textContent = k.intro;
  $('#kinds').innerHTML = Object.entries(KINDS).map(([id, x]) => {
    const n = state.lists[id].filter((a) => a.status === 'review').length;
    return `<a class="role-switch__btn" href="?kind=${id}" data-kind="${id}"${id === state.kind ? ' aria-current="page"' : ''}>${icon(x.icon)}${x.label} <span class="kind-n">${n}</span></a>`;
  }).join('');
  $('#stabs').innerHTML = TABS.map((t) => {
    const n = list().filter((a) => a.status === t).length;
    return `<button type="button" class="seg__btn" role="tab" data-tab="${t}" aria-selected="${t === state.tab}" title="${STATUS[t].label}"><span>${STATUS[t].short}</span><span class="seg__n">${n}</span></button>`;
  }).join('');
  const cur = current();
  // the one applicant made in this browser stands out from the samples
  $('#rows').innerHTML = shown().length ? shown().map((a, i) => `<li style="--i:${Math.min(i, 8)}"><button type="button" class="regrow" data-id="${esc(a.id)}" aria-current="${Boolean(cur && cur.id === a.id)}">
      ${ava(nameOf(a))}
      <span class="row__main"><span class="row__title">${esc(nameOf(a))}</span>
        <span class="row__sub">${esc(a.kind === 'drivers' ? VEHICLE[a.vehicle] || a.vehicle : a.category)} · ${esc(a.kind === 'drivers' ? a.city : a.area)} · ${esc(ago(a.appliedAt))}</span></span>
      ${a.sample ? '' : tag('plain', 'This browser')}</button></li>`).join('')
    : emptyRows(...EMPTY[state.tab](state.kind === 'drivers' ? 'drivers' : 'shops'));
  $('#rows').classList.toggle('is-first', !state.drawn); // rows rise in on the first draw only
  state.drawn = true;
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
    ? [['License', a.papers.license, 0], ['OR/CR', a.papers.orcr, 1], ['Selfie', a.papers.selfie, 2]]
    : [[a.registeredAs === 'SEC' ? 'SEC papers' : 'DTI papers', a.papers.registration, null], ['Business permit', a.papers.permit, 1], ['Owner’s ID', a.papers.ownerId, 0], ['Shop photo', a.papers.shopPhoto, 2]]; // [name, state, which check it goes with]
  const canDecide = a.status === 'review' || a.status === 'fix';
  const done = state.done && state.done.id === a.id ? state.done : null;
  const canCheck = canDecide && !done;
  const on = Math.min(state.paper, papers.length - 1);
  box.innerHTML = `
    <button type="button" class="back" data-back>${icon('i-back')}All ${k.label.toLowerCase()}</button>
    <div class="review__head">
      ${ava(nameOf(a), 'ava--lg')}
      <div class="review__who">
        <h2 class="review__name">${esc(nameOf(a))}</h2>
        <p class="review__meta">Applied ${esc(since(a.appliedAt))} · ${esc(a.phone)} · ${esc(a.email)}</p>
      </div>
      ${tag(a.status, STATUS[a.status].label)}
    </div>
    ${a.status === 'fix' && a.reason && !done ? notice('fix', `<b>Changes requested.</b> ${esc(a.reason)}`) : ''}
    <dl class="facts">${facts.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`).join('')}</dl>
    <section aria-labelledby="papersTitle">
      <h3 class="subtitle" id="papersTitle">${canCheck ? 'Check each paper' : 'Papers'}</h3>
      <!-- Phones and portrait tablets: one big paper at a time, these switch it. Desktop and landscape: every paper beside its check -->
      <div class="rthumbs" role="group" aria-label="Choose a paper">${papers.map(([name, , c], i) => `<button type="button" class="rthumb" data-show="${i}" aria-pressed="${i === on}">${c !== null && ticked[c] ? icon('i-check') : ''}<span>${esc(name)}</span></button>`).join('')}</div>
      <div class="ritems">${papers.map(([name, st, c], i) => `<div class="ritem${i === on ? ' is-on' : ''}${c !== null && ticked[c] ? ' is-ticked' : ''}">
        <button type="button" class="paper" data-paper="${esc(name)}" data-state="${st}" aria-label="${esc(name)}: ${PAPER[st] || st}. Open details">
          <span class="paper__img">${a.sample ? `${DRAWING}<span class="paper__none">No photo yet · <span class="paper__open">View</span></span>` : `Photo of ${esc(name)}<br><span class="paper__open">View details</span>`}</span></button>
        <div class="ritem__side"><span class="ritem__name"><strong>${esc(name)}</strong>${tag(PAPER_TAG[st] || 'rejected', PAPER[st] || st)}</span>
          ${canCheck && c !== null ? `<label class="rcheck"><input type="checkbox" data-check="${c}"${ticked[c] ? ' checked' : ''}><span>${esc(k.checks[c])}</span></label>` : ''}</div></div>`).join('')}</div>
    </section>
    ${canDecide && !done ? `
      ${state.fixOpen ? `<div class="fixbox">
        <div class="afield"><label class="afield__label" for="fixReason">What needs to change</label>
          <select class="select" id="fixReason">${k.reasons.map((r, i) => `<option${i === state.fixPick ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>
          <span class="afield__hint">The applicant sees this in the app and by email.</span></div>
        <div class="afield"><label class="afield__label" for="fixNote">Note to the applicant <span class="muted">(optional)</span></label>
          <textarea class="textarea" id="fixNote" maxlength="200" rows="3" placeholder="e.g. The back of the OR/CR is cut off. Take the photo in good light.">${esc(state.fixNote)}</textarea>
          <span class="afield__hint"><span>Be specific: say what a good photo looks like.</span><span id="fixCount">${state.fixNote.length} / 200</span></span></div>
      </div>` : ''}
      <div class="actions">
        <button type="button" class="button cta" data-decide="approved"${allTicked ? '' : ' disabled'}>${k.approve}</button>
        <button type="button" class="button button--ghost cta" data-decide="fix">${state.fixOpen ? 'Send request' : 'Ask for changes'}</button>
        <button type="button" class="button button--danger cta" data-decide="rejected">Reject</button>
        <span class="actions__hint">${allTicked ? 'All checks done' : `${ticked.filter(Boolean).length} of 3 checks done`}</span>
      </div>` : ''}
    ${done ? notice(done.status, esc(done.text), ' role="status"') : ''}`;
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
  Object.assign(state, { sel: b.dataset.id, open: true, fixOpen: false, done: null, paper: 0 });
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

$('#review').addEventListener('input', (e) => {
  if (e.target.id === 'fixNote') { state.fixNote = e.target.value; $('#fixCount').textContent = `${e.target.value.length} / 200`; }
  if (e.target.id === 'fixReason') state.fixPick = e.target.selectedIndex;
});

/** A paper's details: a big view, what its state means, what to look for, and a shortcut to ask for a fix. */
function openPaper(a, name, st) {
  const help = PAPER_HELP[name] || { look: [], reason: 0 };
  const canFix = (a.status === 'review' || a.status === 'fix') && (st === 'unclear' || st === 'missing');
  openSheet({
    title: `${name} · ${nameOf(a)}`,
    body: `<div class="pview${a.sample ? ' pview--none' : ''}">${a.sample ? `${DRAWING}<p><b>No photo yet.</b> The photo shows here once ${esc(nameOf(a).split(' ')[0])} uploads it.</p>` : `Photo of ${esc(name)}`}</div>
      <p class="pstate">${tag(PAPER_TAG[st] || 'rejected', PAPER[st] || st)} ${PAPER_SAYS[st] || ''}</p>
      ${help.look.length ? `<div><h3 class="subtitle">Look for</h3><ul class="pcheck">${help.look.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
      <div class="actions">${canFix ? `<button type="button" class="button cta" data-askfix>Ask for a new photo</button>` : ''}
        <button type="button" class="button button--ghost cta" data-close>Close</button></div>`,
    onReady: (d) => {
      const b = d.querySelector('[data-askfix]');
      if (b) b.addEventListener('click', () => {
        d.close();
        Object.assign(state, { fixOpen: true, fixPick: help.reason });
        renderReview(a);
        $('#fixNote').focus();
      }, { once: true });
    },
  });
}

$('#review').addEventListener('click', async (e) => {
  if (e.target.closest('[data-back]')) { Object.assign(state, { open: false, fixOpen: false }); render(); return; }
  const show = e.target.closest('[data-show]');
  if (show) {
    state.paper = Number(show.dataset.show);
    renderReview(current());
    if (!calm()) $('.ritem.is-on').animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 320, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    return;
  }
  const p = e.target.closest('[data-paper]');
  if (p) { const a = current(); if (a) openPaper(a, p.dataset.paper, p.dataset.state); return; }
  const b = e.target.closest('[data-decide]');
  const a = current();
  if (!b || !a) return;
  const decision = b.dataset.decide;
  if (decision === 'fix' && !state.fixOpen) { Object.assign(state, { fixOpen: true, fixPick: 0, fixNote: '' }); renderReview(a); $('#fixReason').focus(); return; }
  const note = decision === 'fix' ? $('#fixNote').value.trim() : '';
  const reason = decision === 'fix' ? `${$('#fixReason').value}${note ? `. ${note}` : ''}` : '';
  $$('#review button').forEach((x) => { x.disabled = true; });
  try {
    await adminDecide({ kind: a.kind, id: a.id, decision, reason });
    const k = KINDS[a.kind];
    const text = decision === 'approved' ? `Approved. ${nameOf(a)} ${k.live}.`
      : decision === 'fix' ? `Changes requested: ${reason}. They can upload new photos.` : `Rejected. ${nameOf(a)} will be told why.`;
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
