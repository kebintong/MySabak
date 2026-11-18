/* The scenery behind "A day with mysabak" (js/landing.js calls buildScene and paintScene).
   Drawn here, in the mascot's flat style (no outlines, a light and a shaded side), so it is new art, not reused:
   far hills and skyline, then the stops' streets (homes and palms, IT Park towers, the port and the bridge,
   a carinderia street, the Magellan's Cross pavilion), then lamp posts that pass in front of the rider.
   Layers move at different speeds (parallax). The sky, sun, moon, stars and lit windows follow the clock. */

const SVG = 'http://www.w3.org/2000/svg';
const rnd = (seed) => () => { // small seeded random, so the city looks the same on every visit
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const f1 = (n) => Math.round(n * 10) / 10;

/* ---------- Colours through the day: dawn, morning, noon, golden hour, dusk, night ---------- */
const KEYS = ['skyA', 'skyB', 'hill', 'far', 'mid', 'midSh', 'roof', 'palm', 'near', 'win'];
const TIMES = {
  dawn: ['#f7c6b0', '#fde8d2', '#ecc6c6', '#e8cbd6', '#dcc1e2', '#c8abd5', '#c88a7c', '#8e6aa8', '#5b3f78', '#f1e3f1'],
  morning: ['#f6dbc8', '#fdf3e8', '#e8d2da', '#e6d6e8', '#d9c8ec', '#c3afe0', '#c99282', '#8a68b0', '#563a7a', '#f2eaf8'],
  noon: ['#d8d6fb', '#f4f1fd', '#d2ccf0', '#d8d2f3', '#c9bdf0', '#b2a3e6', '#b68aa8', '#7d5fb3', '#4a3274', '#eeeafc'],
  golden: ['#f39a7c', '#fdd3a8', '#dda2a5', '#daa5b5', '#ba8bb7', '#a274a6', '#a26172', '#6c4590', '#3f2463', '#f6cba8'],
  dusk: ['#3a1666', '#9c4b8e', '#5c2d77', '#4f2670', '#3c1d5e', '#2f164c', '#4a2050', '#2a1144', '#1c0b30', '#4a2a66'],
  night: ['#12042a', '#3a1466', '#2a0f4c', '#241044', '#1e0c3a', '#170830', '#2a0f3c', '#160828', '#0f0520', '#2a1640'],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',')})`;

/* ---------- Drawing: each returns SVG markup standing on y = base ---------- */
const rect = (x, y, w, h, cls, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" class="${cls}"${extra}/>`;
let winN = 0;
function windows(x, top, w, h, cols, rows, r) {
  let s = '';
  const gx = w / cols, gy = h / rows;
  for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) {
    if (r() < 0.18) continue; // some rooms dark
    s += rect(x + c * gx + gx * 0.28, top + k * gy + gy * 0.3, gx * 0.44, gy * 0.42, 'lp-win', ` style="--wd:${(winN++ % 23) * 0.07}s"`);
  }
  return s;
}
function building(x, base, w, h, r, { win = true, cap = r() } = {}) {
  const top = base - h;
  let s = rect(x, top, w, h, 's-mid') + rect(x + w * 0.74, top, w * 0.26, h, 's-midsh');
  if (cap < 0.3) s += rect(x + w * 0.1, top - h * 0.06, w * 0.8, h * 0.06, 's-midsh'); // parapet
  else if (cap < 0.5) s += rect(x + w * 0.46, top - h * 0.16, w * 0.06, h * 0.16, 's-midsh'); // antenna
  if (win) s += windows(x + w * 0.06, top + h * 0.06, w * 0.66, h * 0.86, Math.max(2, Math.round(w / 18)), Math.max(3, Math.round(h / 22)), r);
  return s;
}
function tower(x, base, w, h, r) { // glass office tower, IT Park
  const top = base - h;
  let s = `<path d="M${f1(x)} ${f1(base)}V${f1(top + w * 0.3)}L${f1(x + w * 0.5)} ${f1(top)}L${f1(x + w)} ${f1(top + w * 0.3)}V${f1(base)}Z" class="s-mid"/>`;
  s += `<path d="M${f1(x + w * 0.5)} ${f1(top)}L${f1(x + w)} ${f1(top + w * 0.3)}V${f1(base)}H${f1(x + w * 0.5)}Z" class="s-midsh"/>`;
  s += windows(x + w * 0.08, top + w * 0.45, w * 0.84, h - w * 0.55, Math.max(2, Math.round(w / 16)), Math.round(h / 16), r);
  return s;
}
function house(x, base, w, h, r) { // bahay: walls, a roof, a door
  const top = base - h;
  const roofH = h * 0.5;
  let s = `<path d="M${f1(x - w * 0.08)} ${f1(top)}L${f1(x + w * 0.5)} ${f1(top - roofH)}L${f1(x + w * 1.08)} ${f1(top)}Z" class="s-roof"/>`;
  s += rect(x, top, w, h, 's-mid') + rect(x + w * 0.7, top, w * 0.3, h, 's-midsh');
  s += rect(x + w * 0.16, top + h * 0.22, w * 0.22, h * 0.28, 'lp-win', ` style="--wd:${(winN++ % 23) * 0.07}s"`);
  s += rect(x + w * 0.46, top + h * 0.42, w * 0.18, h * 0.58, 's-midsh');
  if (r() < 0.5) s += rect(x + w * 0.74, top + h * 0.22, w * 0.16, h * 0.24, 'lp-win', ` style="--wd:${(winN++ % 23) * 0.07}s"`);
  return s;
}
function palm(x, base, h, r, cls = 's-palm') {
  const lean = (r() - 0.5) * h * 0.3;
  const tx = x + lean, ty = base - h;
  let s = `<path d="M${f1(x - 3)} ${f1(base)}Q${f1(x + lean * 0.2)} ${f1(base - h * 0.5)} ${f1(tx - 2)} ${f1(ty)}L${f1(tx + 3)} ${f1(ty)}Q${f1(x + lean * 0.3 + 4)} ${f1(base - h * 0.5)} ${f1(x + 4)} ${f1(base)}Z" class="${cls}"/>`;
  [[-1, -0.1], [-0.8, -0.45], [0.8, -0.45], [1, -0.1], [0.1, -0.7]].forEach(([dx, dy]) => {
    const L = h * 0.42;
    s += `<path d="M${f1(tx)} ${f1(ty)}Q${f1(tx + dx * L * 0.5)} ${f1(ty + dy * L - L * 0.25)} ${f1(tx + dx * L)} ${f1(ty + dy * L * 0.2 + L * 0.35)}Q${f1(tx + dx * L * 0.45)} ${f1(ty + dy * L * 0.4)} ${f1(tx)} ${f1(ty)}Z" class="${cls}"/>`;
  });
  return s;
}
function crane(x, base, h) { // port gantry crane
  const top = base - h;
  return `${rect(x, top, h * 0.06, h, 's-midsh')}${rect(x + h * 0.34, top + h * 0.12, h * 0.06, h * 0.88, 's-midsh')}`
    + `${rect(x - h * 0.3, top + h * 0.08, h * 1.05, h * 0.07, 's-mid')}${rect(x + h * 0.6, top + h * 0.15, h * 0.012, h * 0.35, 's-midsh')}`
    + `${rect(x + h * 0.56, top + h * 0.5, h * 0.09, h * 0.07, 's-roof')}`;
}
function ship(x, base, w) {
  const h = w * 0.22;
  return `<path d="M${f1(x)} ${f1(base - h)}H${f1(x + w)}L${f1(x + w * 0.9)} ${f1(base)}H${f1(x + w * 0.06)}Z" class="s-midsh"/>`
    + rect(x + w * 0.56, base - h * 2, w * 0.28, h, 's-mid') + rect(x + w * 0.62, base - h * 2.7, w * 0.08, h * 0.7, 's-roof')
    + [0.1, 0.26, 0.42].map((k) => rect(x + w * k, base - h * 1.55, w * 0.13, h * 0.55, 's-roof')).join('');
}
function bridge(x, base, w, h) { // a long cable-stayed bridge across the channel
  const deck = base - h * 0.32;
  let s = rect(x, deck, w, h * 0.05, 's-midsh');
  [0.32, 0.68].forEach((k) => {
    const px = x + w * k;
    s += rect(px - 5, base - h, 10, h, 's-mid');
    for (let i = 1; i <= 6; i++) {
      [-1, 1].forEach((d) => { s += `<path d="M${f1(px)} ${f1(base - h + 8)}L${f1(px + d * i * w * 0.028)} ${f1(deck)}" class="s-cable"/>`; });
    }
  });
  for (let i = 0; i <= 10; i++) s += rect(x + (w / 10) * i - 3, deck, 6, base - deck, 's-midsh');
  return s;
}
function stall(x, base, w, h) { // carinderia stall: counter, striped awning, string lights
  const top = base - h;
  let s = rect(x, top + h * 0.35, w, h * 0.65, 's-mid') + rect(x + w * 0.72, top + h * 0.35, w * 0.28, h * 0.65, 's-midsh');
  for (let i = 0; i < 6; i++) s += rect(x - w * 0.06 + (w * 1.12 / 6) * i, top + h * 0.14, w * 1.12 / 6, h * 0.2, i % 2 ? 's-awn2' : 's-awn');
  s += rect(x + w * 0.1, top + h * 0.44, w * 0.5, h * 0.26, 'lp-win', ` style="--wd:${(winN++ % 23) * 0.07}s"`);
  for (let i = 0; i < 7; i++) s += `<circle cx="${f1(x + (w / 6) * i)}" cy="${f1(top + h * 0.08 + Math.sin(i / 2) * 4)}" r="3" class="lp-bulb" style="--wd:${i * 0.08}s"/>`;
  return s;
}
function pavilion(x, base, w) { // the Magellan's Cross pavilion: an octagonal kiosk with a tiled roof
  const h = w * 0.95;
  const top = base - h;
  return `<path d="M${f1(x - w * 0.1)} ${f1(top + h * 0.42)}L${f1(x + w * 0.5)} ${f1(top)}L${f1(x + w * 1.1)} ${f1(top + h * 0.42)}Z" class="s-roof"/>`
    + rect(x + w * 0.47, top - h * 0.1, w * 0.06, h * 0.12, 's-roof')
    + rect(x, top + h * 0.42, w, h * 0.58, 's-mid') + rect(x + w * 0.72, top + h * 0.42, w * 0.28, h * 0.58, 's-midsh')
    + [0.12, 0.42].map((k) => rect(x + w * k, top + h * 0.54, w * 0.2, h * 0.46, 's-midsh')).join('');
}
function church(x, base, w) { // a dome and a bell tower
  const h = w * 0.7;
  return rect(x, base - h, w * 0.7, h, 's-mid') + `<path d="M${f1(x + w * 0.05)} ${f1(base - h)}A${f1(w * 0.3)} ${f1(w * 0.3)} 0 0 1 ${f1(x + w * 0.65)} ${f1(base - h)}Z" class="s-midsh"/>`
    + rect(x + w * 0.74, base - h * 1.45, w * 0.24, h * 1.45, 's-mid') + `<path d="M${f1(x + w * 0.72)} ${f1(base - h * 1.45)}L${f1(x + w * 0.86)} ${f1(base - h * 1.75)}L${f1(x + w)} ${f1(base - h * 1.45)}Z" class="s-roof"/>`
    + rect(x + w * 0.8, base - h * 1.25, w * 0.1, h * 0.18, 'lp-win', ` style="--wd:.3s"`);
}
function lamp(x, base, h) { // street lamp; its light switches on after dusk
  const top = base - h;
  return `<path d="M${f1(x + h * 0.2)} ${f1(top + h * 0.06)}L${f1(x + h * 0.02)} ${f1(base)}H${f1(x + h * 0.48)}Z" class="lp-cone"/>`
    + rect(x - 3, top, 6, h, 's-near') + rect(x - 3, top, h * 0.22, 5, 's-near') + rect(x + h * 0.16, top + 2, h * 0.1, h * 0.04, 'lp-lamp');
}
const svg = (w, h, inner) => `<svg xmlns="${SVG}" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}">${inner}</svg>`;

/* ---------- The layers ---------- */
function farLayer(W, H) {
  const r = rnd(7);
  const base = H;
  let s = `<path d="M0 ${f1(H * 0.62)}${Array.from({ length: Math.ceil(W / 260) + 1 }, (_, i) => `Q${f1(i * 260 + 130)} ${f1(H * (0.38 + r() * 0.18))} ${f1(i * 260 + 260)} ${f1(H * (0.55 + r() * 0.1))}`).join('')}V${H}H0Z" class="s-hill"/>`;
  for (let x = 0; x < W;) {
    const w = 26 + r() * 46, h = H * (0.16 + r() * (r() < 0.12 ? 0.5 : 0.28));
    s += rect(x, base - h, w, h, 's-far');
    if (r() < 0.25) s += rect(x + w * 0.45, base - h - 10, 3, 10, 's-far');
    x += w + r() * 8;
  }
  return svg(W, H, s);
}
// Mid layer: each stop's street, placed so it sits behind that stop when the stop is centred
function midLayer(W, H, at) {
  const r = rnd(11);
  const base = H;
  const parts = [];
  const fill = (from, to, kind) => { // low homes and palms between the landmarks
    for (let x = from; x < to;) {
      const w = 40 + r() * 30;
      if (kind === 'palm' || r() < 0.3) { parts.push(palm(x + 10, base, H * (0.34 + r() * 0.2), r)); x += 34; continue; }
      parts.push(house(x, base, w, H * (0.2 + r() * 0.12), r));
      x += w + 14 + r() * 20;
    }
  };
  const [vw] = at.vw;
  const X = (k, p) => k * vw + p * at.shift; // a spot k (0…1 across the screen) when the day is at p
  // Intro and the ride to work: homes, palms, a sari-sari store
  fill(-200, X(0.95, at.marks[0]), 'home');
  // Noon: the IT Park towers
  const n0 = X(0.05, at.marks[1]);
  fill(X(0.95, at.marks[0]), n0, 'home');
  [0, 1, 2, 3, 4, 5].forEach((i) => parts.push(tower(n0 + i * 92 + r() * 20, base, 60 + r() * 26, H * (0.55 + r() * 0.38), r)));
  parts.push(building(n0 + 620, base, 90, H * 0.48, r));
  fill(n0 + 730, X(0.0, at.marks[2]), 'palm');
  // Golden hour: the port, a ship, the bridge
  const g0 = X(0.0, at.marks[2]);
  parts.push(crane(g0 + 20, base, H * 0.62), crane(g0 + 190, base, H * 0.5), ship(g0 + 300, base, 220));
  const b0 = X(0.42, at.marks[2]);
  parts.push(bridge(b0, base, vw * 0.48, H * 0.7));
  // Night: the carinderia street
  const d0 = Math.max(b0 + vw * 0.48 + 20, X(0.16, at.marks[3]));
  for (let i = 0; i < 5; i++) {
    parts.push(stall(d0 + i * 150, base, 100, H * 0.36));
    parts.push(building(d0 + i * 150 + 108, base, 34, H * (0.4 + r() * 0.2), r));
  }
  fill(d0 + 760, X(0.25, 1), 'home');
  // Home again: the pavilion and the church
  const e0 = X(0.3, 1);
  parts.push(pavilion(e0, base, 120), church(e0 + 190, base, 150));
  fill(e0 + 380, W + 100, 'home');
  for (let x = 120; x < W; x += 420) parts.push(lamp(x, base, H * 0.78));
  return svg(W, H, parts.join(''));
}
function nearLayer(W, H) {
  const r = rnd(5);
  let s = '';
  for (let x = 60; x < W; x += 260 + r() * 340) {
    if (r() < 0.6) { // a hedge
      const w = 60 + r() * 90, h = H * (0.5 + r() * 0.4);
      s += `<path d="M${f1(x)} ${H}C${f1(x)} ${f1(H - h)} ${f1(x + w * 0.3)} ${f1(H - h * 1.1)} ${f1(x + w * 0.5)} ${f1(H - h)}C${f1(x + w * 0.7)} ${f1(H - h * 1.15)} ${f1(x + w)} ${f1(H - h * 0.8)} ${f1(x + w)} ${H}Z" class="s-palm"/>`;
    } else { // a railing
      const w = 90 + r() * 60;
      s += rect(x, H * 0.35, w, 4, 's-near');
      for (let i = 0; i <= 4; i++) s += rect(x + (w / 4) * i - 2, H * 0.35, 4, H * 0.65, 's-near');
    }
  }
  return svg(W, H, s);
}
function jeepney(w) {
  const h = w * 0.46;
  return svg(w, h, `<rect x="${w * 0.04}" y="${h * 0.06}" width="${w * 0.84}" height="${h * 0.06}" rx="2" class="j-rack"/>`
    + `<path d="M${w * 0.02} ${h * 0.14}H${w * 0.82}L${w * 0.98} ${h * 0.44}V${h * 0.78}H${w * 0.02}Z" class="j-body"/>`
    + `<rect x="${w * 0.02}" y="${h * 0.56}" width="${w * 0.96}" height="${h * 0.08}" class="j-stripe"/>`
    + [0.06, 0.24, 0.42, 0.6].map((k) => `<rect x="${w * k}" y="${h * 0.22}" width="${w * 0.14}" height="${h * 0.24}" rx="2" class="j-glass"/>`).join('')
    + `<path d="M${w * 0.82} ${h * 0.22}L${w * 0.93} ${h * 0.44}H${w * 0.82}Z" class="j-glass"/>`
    + `<path d="M${w * 0.95} ${h * 0.4}L${w} ${h * 0.34}L${w} ${h * 0.46}Z" class="j-gold"/>`
    + [0.2, 0.78].map((k) => `<circle cx="${w * k}" cy="${h * 0.8}" r="${h * 0.14}" class="j-tyre"/><circle cx="${w * k}" cy="${h * 0.8}" r="${h * 0.06}" class="j-gold"/>`).join(''));
}

/* ---------- The hero's city at dawn: hills, a skyline with a few lit windows, palms ---------- */
export function heroCity(W, H) {
  const r = rnd(21);
  winN = 0;
  let s = `<path d="M0 ${f1(H * 0.5)}${Array.from({ length: Math.ceil(W / 300) + 1 }, (_, i) => `Q${f1(i * 300 + 150)} ${f1(H * (0.22 + r() * 0.16))} ${f1(i * 300 + 300)} ${f1(H * (0.42 + r() * 0.1))}`).join('')}V${H}H0Z" class="s-hill"/>`;
  for (let x = 0; x < W;) {
    const w = 30 + r() * 50, h = H * (0.2 + r() * (r() < 0.15 ? 0.55 : 0.3));
    s += rect(x, H - h, w, h, 's-far');
    for (let k = 0; k < 3; k++) if (r() < 0.35) s += rect(x + w * (0.2 + r() * 0.5), H - h * (0.2 + r() * 0.7), 4, 5, 'lp-win');
    x += w + r() * 10;
  }
  for (let x = 40; x < W; x += 180 + r() * 260) s += palm(x, H, H * (0.4 + r() * 0.25), r, 's-palm');
  return svg(W, H, s);
}

/* ---------- Build (on load and resize) ---------- */
const FAR = 0.15, MID = 0.75, NEAR = 1.25;
let els = null;
let key = '';
let state = { slide: 0, marks: [], vw: 0 };
export function buildScene(pin, { slide, marks, vw, vh }) {
  if (!els) {
    const scene = document.createElement('div');
    scene.className = 'lp-scene';
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML = `<div class="lp-scene__sky"></div><div class="lp-scene__stars"></div><span class="lp-scene__sun"></span><span class="lp-scene__moon"></span>
      <svg class="lp-scene__birds" viewBox="0 0 120 40" width="120" height="40"><path d="M4 20q8-8 16 0q8-8 16 0M50 8q6-6 12 0q6-6 12 0M84 28q7-7 14 0q7-7 14 0"/></svg>
      <div class="lp-layer lp-layer--far"></div><div class="lp-layer lp-layer--mid"></div><div class="lp-scene__jeep"></div>`;
    const near = document.createElement('div');
    near.className = 'lp-layer lp-layer--near';
    near.setAttribute('aria-hidden', 'true');
    pin.prepend(scene);
    pin.append(near);
    const stars = scene.querySelector('.lp-scene__stars');
    const r = rnd(3);
    stars.innerHTML = Array.from({ length: 40 }, () => `<i style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 55).toFixed(1)}%;--s:${(1 + r() * 1.6).toFixed(1)}px"></i>`).join('');
    els = { sky: scene.querySelector('.lp-scene__sky'), scene, near, far: scene.querySelector('.lp-layer--far'), mid: scene.querySelector('.lp-layer--mid'), jeep: scene.querySelector('.lp-scene__jeep'), sun: scene.querySelector('.lp-scene__sun'), moon: scene.querySelector('.lp-scene__moon'), birds: scene.querySelector('.lp-scene__birds'), stars };
  }
  state = { slide, marks, vw, vh };
  const k = `${Math.round(slide)}|${vw}|${vh}`;
  if (k === key) return;
  key = k;
  winN = 0;
  const small = vw < 600;
  const farH = vh * (small ? 0.3 : 0.42), midH = vh * (small ? 0.24 : 0.34), nearH = Math.min(70, vh * 0.08);
  els.far.innerHTML = farLayer(vw + slide * FAR + 40, farH);
  els.mid.innerHTML = midLayer(vw + slide * MID + 200, midH, { vw: [vw], shift: slide * MID, marks });
  els.near.innerHTML = nearLayer(vw + slide * NEAR + 200, nearH);
  state.jw = Math.max(110, vw * 0.1);
  els.jeep.innerHTML = jeepney(state.jw);
}

/* ---------- Paint (every frame the day moves) ---------- */
let lastP = -1;
let night = null;
let band = '';
export function paintScene(pin, p) {
  if (!els) return;
  const { slide, marks, vw, vh } = state;
  els.far.style.transform = `translate3d(${f1(-p * slide * FAR)}px,0,0)`;
  els.mid.style.transform = `translate3d(${f1(-p * slide * MID)}px,0,0)`;
  els.near.style.transform = `translate3d(${f1(-p * slide * NEAR)}px,0,0)`;
  const jw = state.jw;
  const span = vw + jw * 2;
  els.jeep.style.transform = `translate3d(${f1(vw + jw - ((((p * slide * 0.7) % span) + span) % span))}px,0,0)`;
  if (Math.abs(p - lastP) < 0.002) return; // colours: only when the clock has moved
  lastP = p;
  const dusk = (marks[2] + marks[3]) / 2;
  const stopsAt = [[0, 'dawn'], [marks[0], 'morning'], [marks[1], 'noon'], [marks[2], 'golden'], [dusk, 'dusk'], [marks[3], 'night'], [1, 'night']];
  let i = 0;
  while (i < stopsAt.length - 2 && p > stopsAt[i + 1][0]) i++;
  const [p0, a] = stopsAt[i];
  const [p1, b] = stopsAt[i + 1];
  const t = p1 > p0 ? Math.min(1, Math.max(0, (p - p0) / (p1 - p0))) : 0;
  // The sky blends smoothly (a screen-sized box: cheap to repaint). The city's colours change only at a few
  // moments of the day (redrawing the wide city every frame is what slows phones down).
  els.sky.style.setProperty('--c-skyA', mix(TIMES[a][0], TIMES[b][0], t));
  els.sky.style.setProperty('--c-skyB', mix(TIMES[a][1], TIMES[b][1], t));
  const time = t < 0.5 ? a : b;
  if (time !== band) {
    band = time;
    KEYS.forEach((k, n) => { if (n > 1) pin.style.setProperty(`--c-${k}`, TIMES[time][n]); });
  }
  // Sun across the sky until dusk, then the moon and the stars
  const day = Math.min(1, p / dusk);
  const nightness = Math.min(1, Math.max(0, (p - (marks[2] + dusk) / 2) / (marks[3] - (marks[2] + dusk) / 2)));
  els.sun.style.transform = `translate3d(${f1(vw * (0.1 + day * 0.74))}px,${f1(vh * (0.5 - Math.sin(day * Math.PI) * 0.36 + day * day * 0.12))}px,0)`;
  els.sun.style.opacity = String(1 - nightness);
  els.sun.style.setProperty('--warm', day.toFixed(3));
  els.moon.style.opacity = els.stars.style.opacity = nightness.toFixed(3);
  els.birds.style.opacity = String(Math.max(0, 1 - p / marks[1]));
  const isNight = p >= dusk;
  if (isNight !== night) { night = isNight; pin.classList.toggle('is-lit', isNight); }
}
