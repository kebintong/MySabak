/* Shared by the merchant pages (Dashboard, POS, Management): load the branch on screen, the night sky header
   (shop, branch, Accept orders switch) and, for the owner looking at another branch, the view-only / take-over bar. */
import { merchantHome, setShopOpen, viewBranch, takeOverBranch, errorMessage } from '../api.js';
import { $, esc, toast } from '../ui.js';

/** Something failed: a short message, or back to sign-in when signed out. */
export function failed(err) {
  if (err.status === 401) { location.replace('/pages/merchant.html'); return; }
  toast([400, 403, 409].includes(err.status) ? err.message : errorMessage(err));
}

/** merchantHome(), or null after sending a signed-out merchant to sign in. */
export async function loadHome() {
  try { return await merchantHome(); } catch (err) { failed(err); return null; }
}

/**
 * Fill <header data-mhead> and keep it in step. `kicker` replaces the greeting (e.g. "Point of sale").
 * onChange(what) runs after the switch, a branch change or take over ('open' | 'branch').
 * @returns {(home:object) => void} render: call with the latest merchantHome()
 */
export function mountHead({ kicker = '', onChange = () => {} } = {}) {
  const head = $('[data-mhead]');
  head.innerHTML = `
    <div class="mhero">
      <div class="mhero__shop">
        <span class="mhero__ava" data-h="ava" aria-hidden="true"></span>
        <div class="mhero__text">
          <p class="mhero__hello" data-h="hello"></p>
          <h1 class="mhero__title" data-h="name">Your shop</h1>
          <p class="mhero__meta" data-h="meta"></p>
        </div>
      </div>
      <div class="mhero__open">
        <span class="live" data-h="badge"><span class="live__dot" aria-hidden="true"></span><span data-h="label">Open</span></span>
        <span data-h="hint">Accepting orders</span>
        <button type="button" class="switch" data-h="switch" role="switch" aria-checked="true" aria-label="Accepting orders"><span></span></button>
      </div>
    </div>
    <div class="mview" data-h="view" role="status" hidden></div>`;
  const el = (k) => $(`[data-h="${k}"]`, head);
  let home;

  function renderOpen() {
    el('switch').setAttribute('aria-checked', String(home.open));
    el('switch').disabled = !home.canAct;
    el('hint').textContent = home.open ? 'Accepting orders' : 'Not taking orders';
    el('label').textContent = home.open ? 'Open' : 'Closed';
    el('badge').classList.toggle('is-closed', !home.open);
  }

  function render(h) {
    home = h;
    const { shop, branch } = home;
    const hour = new Date().getHours();
    const first = String(home.name || '').split(/\s+/)[0];
    el('hello').textContent = kicker || `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
    el('name').textContent = shop.name;
    el('meta').textContent = `${branch.name} branch${shop.area !== branch.name ? ` · ${shop.area}` : ''} · ${shop.hours || ''}`;
    el('ava').innerHTML = shop.image ? `<img src="${esc(shop.image)}" alt="">`
      : esc(shop.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
    renderOpen();
    const bar = el('view');
    bar.hidden = home.role !== 'owner' || branch.main;
    if (bar.hidden) return;
    const main = home.branches.find((b) => b.main);
    bar.innerHTML = `<p><b>${home.takeover ? `You’ve taken over ${esc(branch.name)}.` : `You’re viewing ${esc(branch.name)}.`}</b>
        ${home.takeover ? 'Your changes go to this branch.' : 'View only: its manager runs it.'}</p>
      <div class="mview__actions"><button type="button" class="button button--ghost mbtn" data-takeover="${home.takeover ? 'off' : 'on'}">${home.takeover ? 'Stop taking over' : 'Take over'}</button>
      <button type="button" class="button mbtn" data-view="">Back to ${esc(main.name)}</button></div>`;
  }

  el('switch').addEventListener('click', async () => {
    const next = !home.open;
    try {
      await setShopOpen(next);
      home.open = next;
      renderOpen();
      toast(next ? 'You’re open. Customers can order.' : 'You’re closed. Customers can’t order for now.');
      onChange('open');
    } catch (err) { failed(err); }
  });

  // View another branch (here or from Management), go back, take over or stop
  document.addEventListener('click', async (e) => {
    const view = e.target.closest('[data-view]');
    const take = e.target.closest('[data-takeover]');
    if (!view && !take) return;
    try {
      if (view) await viewBranch(view.dataset.view || null);
      else await takeOverBranch(take.dataset.takeover === 'on');
      await onChange('branch');
      if (view) $('.content').scrollTo({ top: 0, behavior: 'smooth' }); // the page scrolls inside .content
    } catch (err) { failed(err); }
  });

  return render;
}
