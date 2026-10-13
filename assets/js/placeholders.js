/* =========================================================
   mysabak · placeholder pictures (Shop)
   Used when a shop or menu item has no photo yet (`image` is null).
   ========================================================= */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = (c, fallback) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : fallback);

/** A plain picture for a menu item: its first letter on a soft tile. */
export function itemPicture(item, color = '#5630d8') {
  const c = safeColor(color, '#5630d8');
  const letter = esc(String(item && item.name ? item.name : '?').trim().charAt(0).toUpperCase());
  return `<svg class="pic pic--food" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="52" r="34" fill="#fff"/><circle cx="50" cy="52" r="26" fill="${c}" opacity=".14"/><text x="50" y="62" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="700" font-size="30" fill="${c}">${letter}</text></svg>`;
}

/** A drawn storefront in the shop's colours. */
export function storefront(s) {
  const short = esc(s.sign || s.name.toUpperCase());
  const color = safeColor(s.color, '#5630d8');
  const tint = safeColor(s.tint, '#f4f1fe');
  let aw='';for(let i=0;i<8;i++){const x=18+i*15.5,c=i%2?'#FFFFFF':color;aw+=`<rect x="${x}" y="44" width="15.6" height="8" fill="${c}"/><path d="M${x} 52a7.75 4.5 0 0 0 15.5 0Z" fill="${c}"/>`}
  const goods=[0,1,2,3,4].map(i=>`<rect x="${31+i*9}" y="${66}" width="6" height="${6+(i%3)*2}" rx="1" fill="${['#E86A4A','#F2C23A','#5AA05A','#4F8FD1','#B07AD1'][i]}"/>`).join('');
  return `<svg class="pic pic--store" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="160" height="100" fill="${tint}"/><circle cx="138" cy="16" r="8" fill="#fff" opacity=".7"/><rect y="86" width="160" height="14" fill="#D3CBBD"/><rect x="18" y="20" width="124" height="68" fill="#FBF7F0"/><rect x="18" y="20" width="124" height="68" fill="none" stroke="#00000022"/><rect x="28" y="24" width="104" height="15" rx="2" fill="${color}"/><text x="80" y="35" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="8" letter-spacing=".6" fill="#fff">${short}</text>${aw}<rect x="28" y="58" width="52" height="26" fill="#D3E6EE"/><path d="M28 64h52M28 74h52" stroke="#B9CFD8"/>${goods}<rect x="92" y="58" width="26" height="30" fill="${color}" opacity=".85"/><circle cx="113" cy="74" r="1.3" fill="#fff"/><circle cx="132" cy="80" r="7" fill="#5E9B4A"/><circle cx="127" cy="76" r="5" fill="#6FAE58"/><rect x="128" y="82" width="8" height="6" fill="#B36B3A"/></svg>`;
}
