/* Management (pages/merchant-manage.html): the owner's branches (Add branch with its manager’s sign-in,
   change manager, turn a branch account off, view a branch), the shop customers see, and the menu (edit, and
   sold-out per branch). A branch account sees its own branch and marks its menu items sold out. */
import {
  setItemAvailable, updateShop, updateItem, addBranch, changeBranchManager, setBranchAccount, errorMessage,
} from '../api.js';
import { BRANCH_AREAS } from '../demo-data.js';
import { itemPicture, storefront } from '../placeholders.js';
import { $, mountChrome, esc, peso, toast, icon, tag } from '../ui.js';
import { failed, loadHome, mountHead } from './merchant-common.js';

mountChrome({ roles: ['merchant'] });

let home = null;
let openRow = new URLSearchParams(location.search).get('branch'); // the branch row shown open
let editingManager = null; // the branch whose "Change manager" form is open

const shopPicture = (shop) => (shop.image ? `<img src="${esc(shop.image)}" alt="">` : storefront({ ...shop, sign: '' }));
const itemPic = (i) => (i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : itemPicture(i, '#6a2fb0'));
const isOwner = () => home.role === 'owner';


/* ---------- Management: the branches (owner), or this branch (branch account) ---------- */
const ACCOUNT = { owner: 'You (owner)', active: 'Active', disabled: 'Turned off' };
const fact = (k, v) => `<div class="bfact"><span>${k}</span><b>${v}</b></div>`;

function branchRow(b) {
  const open = openRow === b.id;
  const onScreen = b.id === home.branch.id;
  const managerForm = editingManager === b.id ? `<form class="bmanager" data-manager="${esc(b.id)}" novalidate>
      <label class="field"><span class="field__label">New manager’s name</span><input class="input" name="managerName" required maxlength="60" autocomplete="off"></label>
      <label class="field"><span class="field__label">Mobile number or email</span><input class="input" name="managerLogin" required autocapitalize="off" spellcheck="false" autocomplete="off"></label>
      <p class="field__error" role="alert" hidden></p>
      <div class="badd__actions"><button type="button" class="button button--ghost mbtn" data-manager-cancel>Cancel</button><button type="submit" class="button mbtn">Save</button></div>
    </form>` : '';
  const actions = [
    onScreen ? '<span class="badge">On screen</span>' : `<button type="button" class="button mbtn" data-view="${b.main ? '' : esc(b.id)}">View branch</button>`,
    !b.main && !editingManager ? `<button type="button" class="button button--ghost mbtn" data-change-manager="${esc(b.id)}">Change manager</button>` : '',
    !b.main && b.account.status === 'active' ? `<button type="button" class="button button--ghost mbtn" data-account="${esc(b.id)}" data-to="disabled">Turn off account</button>` : '',
    !b.main && b.account.status === 'disabled' ? `<button type="button" class="button button--ghost mbtn" data-account="${esc(b.id)}" data-to="active">Turn account on</button>` : '',
  ].join('');
  return `<li class="branch${open ? ' is-open' : ''}">
    <button type="button" class="branch__head" data-branch="${esc(b.id)}" aria-expanded="${open}">
      <span class="branch__pin" aria-hidden="true">${icon('i-pin')}</span>
      <span class="branch__text"><span class="branch__name">${esc(b.name)}${b.main ? ' <small>Main</small>' : ''}</span>
        <span class="branch__area">${esc(b.area)} · ${b.todayOrders} order${b.todayOrders === 1 ? '' : 's'} today</span></span>
      <span class="branch__state">${b.account.status === 'disabled' ? tag('rejected', 'Turned off') : b.open ? tag('approved', 'Open') : tag('rejected', 'Closed')}</span>
    </button>
    <div class="branch__body"><div class="branch__inner"><div class="branch__detail">
      ${fact('Address', esc(b.address))}${fact('Hours', esc(b.hours))}
      ${fact('Manager', `${esc(b.manager.name)}<small>${esc(b.manager.login)}</small>`)}${fact('Today', `${b.todayOrders} orders · ${peso(b.todaySales)}`)}
      ${fact('Phone', esc(b.phone || '—'))}${fact('Account', ACCOUNT[b.account.status])}
      ${managerForm}
      <div class="branch__go">${actions}</div>
    </div></div></div>
  </li>`;
}

function renderManagement() {
  const owner = isOwner();
  $('#mgmtTitle').firstChild.textContent = owner ? 'Branches ' : 'Your branch ';
  $('#addBranch').hidden = !owner;
  if (owner) {
    $('#mgmtCount').textContent = `${home.branches.length} branch${home.branches.length === 1 ? '' : 'es'}`;
    $('#branchList').innerHTML = home.branches.map(branchRow).join('');
    return;
  }
  const b = home.branch;
  $('#mgmtCount').textContent = '';
  $('#branchList').innerHTML = `<li class="bself">
    ${fact('Branch', esc(b.name))}${fact('Hours', esc(b.hours))}${fact('Address', esc(b.address))}${fact('Manager', esc(b.manager.name))}
    <p class="bself__note">The shop owner sets the menu and prices. You run this branch’s orders, its Accept orders switch and sold-out items.</p></li>`;
}

let section = 'all';

/** The item's variants with their full price (item price + the variant's price), or [] when it has none. */
const variantsOf = (item) => {
  const g = (item.options || []).find((o) => o.type === 'one' && o.required);
  return g ? g.choices.map((c) => ({ name: c.name, price: item.price + (c.price || 0) })) : [];
};

function renderMenu() {
  renderMenu.count();
  const sections = [...new Set(home.shop.menu.map((i) => i.section).filter(Boolean))];
  if (section !== 'all' && !sections.includes(section)) section = 'all';
  $('#menuFilter').innerHTML = ['all', ...sections].map((sec) =>
    `<button type="button" class="fchip" data-section="${esc(sec)}" aria-pressed="${sec === section}">${sec === 'all' ? 'All' : esc(sec)}</button>`).join('');
  const items = home.shop.menu.filter((i) => section === 'all' || i.section === section);
  $('#menuList').innerHTML = items.map((i, n) => {
    const on = home.available[i.id];
    const variants = variantsOf(i);
    return `<li class="pcard${on ? '' : ' is-off'}" style="--i:${n}">
      <div class="pcard__img">${itemPic(i)}
        <span class="pcard__section">${esc(i.section || '')}</span><span class="pcard__sold">Sold out</span></div>
      <div class="pcard__body">
        <div class="pcard__top"><h3 class="pcard__name">${esc(i.name)}</h3><span class="pcard__price">${variants.length > 1 ? '<small>from</small> ' : ''}${peso(i.price)}</span></div>
        ${i.note ? `<p class="pcard__desc">${esc(i.note)}</p>` : ''}
        ${variants.length ? `<ul class="pcard__variants" aria-label="Prices">${variants.map((v) => `<li><span>${esc(v.name)}</span><b>${peso(v.price)}</b></li>`).join('')}</ul>` : ''}
        <div class="pcard__foot"><span class="pcard__state">${on ? tag('approved', 'Available') : tag('rejected', 'Sold out')}</span>
          ${isOwner() ? `<button type="button" class="button button--ghost pcard__edit" data-edit="${esc(i.id)}" aria-label="Edit ${esc(i.name)}">Edit</button>` : ''}
          <button type="button" class="switch" role="switch" aria-checked="${on}" aria-label="${esc(i.name)} available" data-item="${esc(i.id)}"${home.canAct ? '' : ' disabled'}><span></span></button></div>
      </div></li>`;
  }).join('');
}

renderMenu.count = () => {
  const off = home.shop.menu.filter((i) => !home.available[i.id]).length;
  $('#menuCount').textContent = off ? `${off} sold out` : 'All available';
};


function renderShop() {
  const { shop } = home;
  $('#shopPhoto').innerHTML = shopPicture(shop);
  $('#shopCardName').textContent = shop.name;
  $('#shopAbout').textContent = shop.about || 'Add a short description so customers know what you’re known for.';
  $('#editShop').hidden = !isOwner();
}

const head = mountHead({ kicker: 'Management', onChange: (what) => (what === 'branch' ? reload() : null) });

function render() {
  head(home);
  renderShop();
  renderManagement();
  renderMenu();
}

async function reload() {
  home = await loadHome();
  if (!home) return;
  $('#manage').hidden = false;
  render();
}


/* ---------- Management: rows, Add branch, manager, account, view / take over ---------- */

$('#branchArea').innerHTML = `<option value="">Pick an area</option>${BRANCH_AREAS.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}`;

function setAddOpen(open) {
  $('#addBranch').classList.toggle('is-open', open);
  $('#addBranchBtn').setAttribute('aria-expanded', String(open));
  if (open) setTimeout(() => $('#addBranchForm').elements.name.focus({ preventScroll: true }), 200);
}
$('#addBranchBtn').addEventListener('click', () => setAddOpen(!$('#addBranch').classList.contains('is-open')));
$('#addBranchCancel').addEventListener('click', () => { $('#addBranchForm').reset(); setAddOpen(false); });
$('#addBranchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const error = $('.field__error', form);
  const btn = $('[type="submit"]', form);
  btn.disabled = true;
  error.hidden = true;
  try {
    const { branch } = await addBranch(Object.fromEntries(new FormData(form)));
    form.reset();
    setAddOpen(false);
    openRow = branch.id;
    toast('Branch added. Its manager signs in on Merchant sign in with the mobile number or email you entered.');
    await reload();
  } catch (err) {
    if (err.status === 401) { failed(err); return; }
    error.textContent = err.status >= 400 && err.status < 500 ? err.message : errorMessage(err);
    error.hidden = false;
  }
  btn.disabled = false;
});

$('#management').addEventListener('click', async (e) => {
  const head = e.target.closest('[data-branch]');
  if (head) { openRow = openRow === head.dataset.branch ? null : head.dataset.branch; editingManager = null; renderManagement(); return; }
  const change = e.target.closest('[data-change-manager]');
  if (change) { editingManager = change.dataset.changeManager; renderManagement(); $('[data-manager] input').focus(); return; }
  if (e.target.closest('[data-manager-cancel]')) { editingManager = null; renderManagement(); return; }
  const acct = e.target.closest('[data-account]');
  if (acct) {
    acct.disabled = true;
    try {
      await setBranchAccount(acct.dataset.account, acct.dataset.to);
      toast(acct.dataset.to === 'disabled' ? 'Branch account turned off. It can’t sign in, and customers can’t order from it.' : 'Branch account turned back on.');
      await reload();
    } catch (err) { failed(err); acct.disabled = false; }
  }
});

$('#management').addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-manager]');
  if (!form) return;
  e.preventDefault();
  const error = $('.field__error', form);
  try {
    await changeBranchManager(form.dataset.manager, Object.fromEntries(new FormData(form)));
    editingManager = null;
    toast('Manager changed. They sign in with the mobile number or email you entered.');
    await reload();
  } catch (err) {
    if (err.status === 401) { failed(err); return; }
    error.textContent = err.status >= 400 && err.status < 500 ? err.message : errorMessage(err);
    error.hidden = false;
  }
});

// View another branch (Management or the view bar), go back, take over or stop

/* ---------- Edit sheet: one for the shop, one per product ---------- */

/** A picked photo, shrunk to at most `max` px on its long side, as a JPEG data URL (the backend uploads it). */
async function shrinkPhoto(file, max = 1000) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Open the edit sheet. `fields` is the form's inner HTML (after the photo); `save(form, photo)` sends the change,
 * `photo` being the new data URL or undefined when it wasn't changed.
 */
function openEditor({ title, picture, fields, save }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet medit';
  dlg.setAttribute('aria-labelledby', 'editTitle');
  dlg.innerHTML = `<form class="sheet__body" novalidate>
      <span class="sheet__handle" aria-hidden="true"></span>
      <h2 class="sheet__title" id="editTitle">${esc(title)}</h2>
      <label class="medit__photo"><span class="medit__pic">${picture}</span>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span class="medit__change">Change photo</span></label>
      ${fields}
      <p class="field__error" role="alert" hidden></p>
      <div class="sheet__actions"><button type="button" class="button button--ghost" value="cancel">Cancel</button><button type="submit" class="button">Save</button></div>
    </form>`;
  document.body.appendChild(dlg);
  const form = $('form', dlg);
  const error = $('.field__error', form);
  let photo;
  const { photo: picker } = form.elements;
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    if (!file) return;
    try {
      photo = await shrinkPhoto(file);
      $('.medit__pic', form).innerHTML = `<img src="${esc(photo)}" alt="">`;
      error.hidden = true;
    } catch (_) {
      error.textContent = 'That picture couldn’t be opened. Try a JPEG or PNG photo.';
      error.hidden = false;
    }
  });
  $('[value="cancel"]', form).addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('[type="submit"]', form);
    btn.disabled = true;
    error.hidden = true;
    try {
      await save(form, photo);
      dlg.close();
      toast('Saved.');
      await reload();
    } catch (err) {
      if (err.status === 401) { location.replace('/pages/merchant.html'); return; }
      error.textContent = err.status >= 400 && err.status < 500 ? err.message : errorMessage(err);
      error.hidden = false;
      btn.disabled = false;
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

const field = (label, control, hint = '') => `<label class="field"><span class="field__label">${label}</span>${control}${hint ? `<span class="field__hint">${hint}</span>` : ''}</label>`;

$('#editShop').addEventListener('click', () => {
  const { shop } = home;
  openEditor({
    title: 'Edit your shop',
    picture: shopPicture(shop),
    fields: field('Shop name', `<input class="input" name="name" required maxlength="60" value="${esc(shop.name)}">`)
      + field('About your shop', `<textarea class="textarea" name="about" maxlength="200">${esc(shop.about || '')}</textarea>`, 'Shown to customers on your shop page. Up to 200 characters.'),
    save: ({ elements: f }, image) => updateShop({ name: f.name.value, about: f.about.value, image }),
  });
});

$('#menuList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (!b) return;
  const item = home.shop.menu.find((i) => i.id === b.dataset.edit);
  const sections = [...new Set(home.shop.menu.map((i) => i.section).filter(Boolean))];
  openEditor({
    title: `Edit ${item.name}`,
    picture: itemPic(item),
    fields: field('Name', `<input class="input" name="name" required maxlength="60" value="${esc(item.name)}">`)
      + field('Description', `<textarea class="textarea" name="note" maxlength="200">${esc(item.note || '')}</textarea>`)
      + `<div class="medit__row">${field('Price (₱)', `<input class="input" name="price" type="number" inputmode="numeric" min="1" step="1" required value="${item.price}">`,
        variantsOf(item).length > 1 ? 'Sizes add their price on top.' : '')}
        ${field('Section', `<input class="input" name="section" required maxlength="30" list="menuSections" value="${esc(item.section || '')}">`)}</div>
        <datalist id="menuSections">${sections.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`,
    save: ({ elements: f }, image) => updateItem(item.id, {
      name: f.name.value, note: f.note.value, price: f.price.value, section: f.section.value, image,
    }),
  });
});


$('#menuList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-item]');
  if (!b) return;
  const id = b.dataset.item;
  const next = !home.available[id];
  try {
    await setItemAvailable(id, next);
    home.available[id] = next;
    b.setAttribute('aria-checked', String(next)); // switch slides; the card dims and shows "Sold out"
    renderMenu.count();
    const card = b.closest('.pcard');
    card.classList.toggle('is-off', !next);
    $('.pcard__state', card).innerHTML = next ? tag('approved', 'Available') : tag('rejected', 'Sold out');
  } catch (err) { failed(err); }
});

$('#menuFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-section]');
  if (!b) return;
  section = b.dataset.section;
  renderMenu();
});

reload();
