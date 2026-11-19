/* The scenery behind "A day with mysabak" (js/landing.js calls buildScene and paintScene), and the city skylines in
   the hero and the closing panel (heroCity). Drawn here in the mascot's flat style (no outlines; a lit and a shaded
   side), so it is new art, not reused. Back to front:
   - far: two mountain ranges with uneven ridgelines (the far one hazy), then the skyline, tallest downtown;
   - middle: each stop's street (homes of many kinds and trees, downtown towers, the port on the water and the
     bridge, a carinderia street, the Magellan's Cross pavilion), power poles with sagging wires, street lamps;
   - front: benches, bougainvillea, bollards and a jeepney waiting shed on the near sidewalk.
   Layers move at different speeds (parallax). The sky, sun, moon, stars and lit windows follow the clock.
   Everything is drawn once (on load and resize); scrolling only slides the layers. */

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
  noon: ['#d8d6fb', '#f4f1fd', '#d2ccf0', '#d8d2f3', '#c9bdf0', '#a492dc', '#b68aa8', '#7d5fb3', '#4a3274', '#eeeafc'],
  golden: ['#f39a7c', '#fdd3a8', '#dda2a5', '#daa5b5', '#ba8bb7', '#a274a6', '#a26172', '#6c4590', '#3f2463', '#f6cba8'],
  dusk: ['#3a1666', '#9c4b8e', '#5c2d77', '#4f2670', '#3c1d5e', '#2f164c', '#4a2050', '#2a1144', '#1c0b30', '#4a2a66'],
  night: ['#12042a', '#3a1466', '#2a0f4c', '#241044', '#1e0c3a', '#170830', '#2a0f3c', '#160828', '#0f0520', '#2a1640'],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',')})`;
// Every colour the drawings use, for one moment of the day. Farther things are mixed toward the sky (haze).
function palette(time) {
  const [, skyB, hill, far, mid, midSh, roof, palm, near, win] = TIMES[time];
  const dark = time === 'dusk' || time === 'night';
  return {
    mtn: mix(hill, skyB, 0.5), hill: mix(hill, skyB, 0.15), far: mix(far, skyB, 0.12), mid, midSh, win,
    mid2: mix(mid, roof, 0.18), mid3: mix(mid, dark ? '#000000' : '#ffffff', dark ? 0.14 : 0.22),
    roof, roof2: mix(roof, midSh, 0.5), roof3: mix(roof, palm, 0.45),
    leaf: palm, leafSh: mix(palm, near, 0.45), trunk: mix(near, roof, 0.3),
    flower: dark ? mix('#e46aa8', near, 0.6) : '#e57fb6', near,
    water: mix(midSh, skyB, 0.3), waterHi: mix(skyB, '#ffffff', dark ? 0.05 : 0.4),
    road: mix(midSh, near, dark ? 0.55 : 0.42), walk: mix(mid, midSh, 0.4),
    box1: dark ? mix('#e8a23c', near, 0.45) : '#e8a23c', box2: dark ? mix('#7b3fbf', near, 0.45) : '#8d5ad1', box3: mix(roof, '#ffffff', dark ? 0 : 0.2),
    pole: mix(near, midSh, 0.3), crane: mix(midSh, near, 0.25), hull: mix(near, roof, 0.3),
    bench: mix(roof, near, 0.25), benchSh: mix(roof, near, 0.55),
    rock: mix(midSh, near, 0.35), rockHi: mix(midSh, '#ffffff', dark ? 0.06 : 0.25), cross: dark ? '#e8b46a' : '#9a5f36',
  };
}

/* ---------- Drawing helpers: each returns SVG markup standing on y = base ---------- */
const rect = (x, y, w, h, cls, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" class="${cls}"${extra}/>`;
const path = (d, cls) => `<path d="${d}" class="${cls}"/>`;
let winN = 0;
let swayN = 0; // a counter, not r(): a random draw here would reshuffle the whole street
const win = (x, y, w, h) => rect(x, y, w, h, 'lp-win', ` style="--wd:${(winN++ % 29) * 0.06}s"`) + (w > 6 ? rect(x - w * 0.08, y + h, w * 1.16, Math.max(1, h * 0.1), 's-midsh') : ''); // with a sill
function windows(x, top, w, h, cols, rows, r, skip = 0.2) {
  let s = '';
  const gx = w / cols, gy = h / rows;
  for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) if (r() > skip) s += win(x + c * gx + gx * 0.26, top + k * gy + gy * 0.28, gx * 0.48, gy * 0.44);
  return s;
}
// A ridgeline: midpoint displacement (natural, uneven), plus a few named peaks of different heights and widths
function ridge(W, H, { base, amp, rough = 0.55, seed, peaks = [] }) {
  const r = rnd(seed);
  const n = 2 ** Math.max(4, Math.ceil(Math.log2(W / 18)));
  const ys = new Array(n + 1).fill(0);
  ys[0] = (r() - 0.5) * amp; ys[n] = (r() - 0.5) * amp;
  for (let step = n, a = amp; step > 1; step /= 2, a *= rough) {
    for (let i = step / 2; i < n; i += step) ys[i] = (ys[i - step / 2] + ys[i + step / 2]) / 2 + (r() - 0.5) * a;
  }
  let d = `M0 ${H}`;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    let y = H * base + ys[i];
    peaks.forEach((p) => { y -= p.h * Math.exp(-(((x - p.x) / p.w) ** 2)); });
    d += `L${f1(x)} ${f1(Math.min(H, Math.max(2, y)))}`;
  }
  return `${d}L${f1(W)} ${H}Z`;
}

/* ---------- Plants ---------- */
// A coconut palm: a curved trunk that narrows, ring marks, a crown of long fronds that arch out and droop, with
// leaflets that hang down like a fringe (not spikes), and a cluster of coconuts
function palm(x, base, h, r, cls = 's-leaf', trunkCls = 's-trunk') {
  const lean = (r() - 0.5) * h * 0.4;
  const tx = x + lean, ty = base - h;
  const wb = Math.max(2.6, h * 0.04), wt = Math.max(1.4, h * 0.02);
  let s = path(`M${f1(x - wb)} ${base}Q${f1(x + lean * 0.12 - wb)} ${f1(base - h * 0.55)} ${f1(tx - wt)} ${f1(ty)}L${f1(tx + wt)} ${f1(ty)}Q${f1(x + lean * 0.12 + wb)} ${f1(base - h * 0.55)} ${f1(x + wb)} ${base}Z`, trunkCls);
  for (let k = 1; k < 7; k++) {
    const t = k / 7, px = x + lean * t * t, py = base - h * t, w = wb * (1 - t * 0.5);
    s += rect(px - w, py, w * 2, 1, 'lp-ring');
  }
  const L = h * (0.48 + r() * 0.1);
  // the crown sways in the breeze around the top of the trunk, each palm out of step
  s += `<g class="lp-sway" style="transform-origin:${f1(tx)}px ${f1(ty)}px;--sw:${6 + (swayN % 3) * 1.3}s;animation-delay:${-(swayN++ % 7) * 1.1}s">`;
  // fronds: [direction (-1 left, 1 right), reach, rise]; the old drooping ones first, so the fresh ones sit on top
  const set = [[-1, 0.74, -0.15], [1, 0.76, -0.18], [-0.9, 0.95, 0.15], [0.92, 0.92, 0.18], [-1, 1, 0.4], [1, 1, 0.42], [-0.55, 0.8, 0.75], [0.6, 0.78, 0.72], [0.08, 0.5, 0.95]];
  set.forEach(([d, reach, rise], i) => {
    const len = L * reach * (0.88 + r() * 0.24);
    const cx = tx + d * len * 0.5;
    const cy = ty - len * (0.25 + rise * 0.35);
    const ex = tx + d * len * (0.9 - rise * 0.3);
    const ey = ty + len * (0.62 - rise * 0.7); // the tip droops below the crown
    s += frond(tx, ty, cx, cy, ex, ey, len * 0.13, i < 2 && cls === 's-leaf' ? 's-leafsh' : cls);
  });
  [[-1.1, 2.6], [1.2, 3.2], [0, 4.2]].forEach(([dx, dy]) => { s += `<circle cx="${f1(tx + dx * wt * 1.4)}" cy="${f1(ty + dy)}" r="${f1(Math.max(1.8, h * 0.024))}" class="s-nut"/>`; });
  return s + '</g>';
}
// One frond: a long leaf that arches from the crown and droops at the tip. Its leaflets hang below the rib, so the
// lower edge is wide and notched (the gaps between leaflets); the upper edge is a thin, lightly notched strip.
function frond(x0, y0, cx, cy, x1, y1, W, cls) {
  const N = 18;
  const pt = (t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1];
  const tan = (t) => { const [ax, ay] = pt(Math.max(0, t - 0.01)); const [bx, by] = pt(Math.min(1, t + 0.01)); const l = Math.hypot(bx - ax, by - ay) || 1; return [(bx - ax) / l, (by - ay) / l]; };
  const up = [], down = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [px, py] = pt(t);
    const [ux, uy] = tan(t);
    let nx = -uy, ny = ux;
    if (ny > 0) { nx = -nx; ny = -ny; } // n points up
    const body = Math.sin(Math.PI * t) ** 0.7; // 0 at the crown and the tip, widest along the middle
    const wu = W * 0.3 * body * (i % 2 ? 0.55 : 1);
    const wd = W * body * (i % 2 ? 0.4 : 1); // every other point pulled in: the notches
    up.push(`${f1(px + nx * wu)} ${f1(py + ny * wu)}`);
    down.push(`${f1(px - nx * wd - ux * wd * 0.3)} ${f1(py - ny * wd - uy * wd * 0.3 + wd * 0.3)}`); // leaflets hang back and down
  }
  return path(`M${up.join('L')}L${down.reverse().join('L')}Z`, cls);
}
// A round-canopy tree (mango, acacia): a trunk and overlapping clusters, lit on the left
// A tapered limb that bends: wide where it leaves the trunk, thin at the tip
function limb(x0, y0, x1, y1, w, bend) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const cx = (x0 + x1) / 2 + nx * bend, cy = (y0 + y1) / 2 + ny * bend;
  return path(`M${f1(x0 + nx * w)} ${f1(y0 + ny * w)}Q${f1(cx + nx * w * 0.5)} ${f1(cy + ny * w * 0.5)} ${f1(x1)} ${f1(y1)}Q${f1(cx - nx * w * 0.5)} ${f1(cy - ny * w * 0.5)} ${f1(x0 - nx * w)} ${f1(y0 - ny * w)}Z`, 's-trunk');
}
// A round-canopy tree (mango, acacia): the trunk forks into curved limbs that fork again; the leaves grow in
// clumps at the ends of the limbs, with gaps where the branches show through
function tree(x, base, h, r) {
  const cw = h * (0.6 + r() * 0.2);
  const fy = base - h * 0.4, tw = Math.max(2.4, h * 0.035);
  let s = path(`M${f1(x - tw * 1.3)} ${base}Q${f1(x - tw)} ${f1(base - h * 0.2)} ${f1(x - tw * 0.8)} ${f1(fy)}H${f1(x + tw * 0.8)}Q${f1(x + tw)} ${f1(base - h * 0.2)} ${f1(x + tw * 1.3)} ${base}Z`, 's-trunk');
  const ends = [[-0.42, -0.62, -1], [0.44, -0.66, 1], [0.04, -0.98, 0.3]].map(([ex, ey, d]) => [x + ex * cw, base - h * 0.4 + ey * h * 0.55, d]);
  const clumps = [];
  ends.forEach(([ex, ey, d]) => {
    s += limb(x, fy, ex, ey, tw * 0.75, d * h * 0.05);
    const mx = x + (ex - x) * 0.55, my = fy + (ey - fy) * 0.55; // a smaller branch forks off part way
    const tx = ex + d * cw * 0.18 + (d === 0.3 ? cw * 0.1 : 0), ty = ey + h * 0.08;
    s += limb(mx, my, tx, ty, tw * 0.4, -d * h * 0.03);
    clumps.push([ex, ey, 0.26], [tx, ty - h * 0.02, 0.19]);
  });
  clumps.forEach(([cx, cy, k], i) => {
    const rr = cw * k * (0.9 + r() * 0.2);
    s += `<circle cx="${f1(cx + rr * 0.15)}" cy="${f1(cy + rr * 0.2)}" r="${f1(rr)}" class="s-leafsh"/>`; // the shaded underside
    s += `<circle cx="${f1(cx - rr * 0.1)}" cy="${f1(cy - rr * 0.08)}" r="${f1(rr * 0.86)}" class="s-leaf"/>`;
  });
  return s;
}
function banana(x, base, h) { // broad, split leaves
  let s = rect(x - 2, base - h * 0.55, 4, h * 0.55, 's-leafsh');
  [[-1, 0.9], [1, 0.8], [-0.6, 1.1], [0.7, 1.05], [0.05, 1.2]].forEach(([d, k]) => {
    const ex = x + d * h * 0.42, ey = base - h * k * 0.62;
    s += path(`M${f1(x)} ${f1(base - h * 0.55)}Q${f1(x + d * h * 0.1)} ${f1(ey - h * 0.22)} ${f1(ex)} ${f1(ey)}Q${f1(x + d * h * 0.22)} ${f1(ey + h * 0.12)} ${f1(x)} ${f1(base - h * 0.5)}Z`, d < 0 ? 's-leaf' : 's-leafsh');
  });
  return s;
}
function bougainvillea(x, base, w, r) { // a bush with pink flowers
  const h = w * 0.5;
  let s = '';
  for (let i = 0; i < 6; i++) s += `<circle cx="${f1(x + w * (0.12 + i * 0.15))}" cy="${f1(base - h * (0.35 + r() * 0.3))}" r="${f1(h * (0.38 + r() * 0.2))}" class="${i % 2 ? 's-leafsh' : 's-leaf'}"/>`;
  s += rect(x, base - h * 0.35, w, h * 0.35, 's-leafsh');
  for (let i = 0; i < 9; i++) s += `<circle cx="${f1(x + w * (0.08 + r() * 0.84))}" cy="${f1(base - h * (0.4 + r() * 0.5))}" r="${f1(1.6 + r() * 2.2)}" class="s-flower"/>`;
  return s;
}

/* ---------- Houses and buildings ---------- */
const HOUSES = ['bungalow', 'twostorey', 'shed', 'tank', 'sarisari', 'apartment'];
function house(kind, x, base, u, r) { // u: size unit (the mid layer's height / 10)
  const walls = ['s-mid', 's-mid2', 's-mid3'][Math.floor(r() * 3)];
  const roofs = ['s-roof', 's-roof2', 's-roof3'][Math.floor(r() * 3)];
  let s = '';
  if (kind === 'bungalow') { // a gable tin roof, a door, two windows
    const w = u * (4.4 + r()), h = u * 2.4;
    s += rect(x, base - h, w, h, walls) + rect(x + w * 0.72, base - h, w * 0.28, h, 's-midsh');
    s += path(`M${f1(x - u * 0.4)} ${f1(base - h)}L${f1(x + w * 0.5)} ${f1(base - h - u * 1.6)}L${f1(x + w + u * 0.4)} ${f1(base - h)}Z`, roofs);
    s += path(`M${f1(x + w * 0.5)} ${f1(base - h - u * 1.6)}L${f1(x + w + u * 0.4)} ${f1(base - h)}H${f1(x + w * 0.5)}Z`, 'lp-ring') + rect(x, base - h, w, u * 0.16, 'lp-ring');
    for (let k = 1; k < 5; k++) s += rect(x + w * 0.5 - (w * 0.5 + u * 0.4) * (k / 5) * 0.98, base - h - u * 1.6 * (1 - k / 5), 1, u * 1.6 * (1 - k / 5) * 0.9, 'lp-ring');
    s += rect(x + w * 0.42, base - h * 0.66, w * 0.16, h * 0.66, 's-midsh') + win(x + w * 0.12, base - h * 0.7, w * 0.18, h * 0.3) + win(x + w * 0.66, base - h * 0.7, w * 0.16, h * 0.3);
    return [s, w];
  }
  if (kind === 'twostorey') { // concrete, a balcony with a railing, a hipped roof
    const w = u * (4 + r()), h = u * 4.6;
    s += rect(x, base - h, w, h, walls) + rect(x + w * 0.74, base - h, w * 0.26, h, 's-midsh');
    s += path(`M${f1(x - u * 0.3)} ${f1(base - h)}L${f1(x + w * 0.22)} ${f1(base - h - u * 1.1)}L${f1(x + w * 0.78)} ${f1(base - h - u * 1.1)}L${f1(x + w + u * 0.3)} ${f1(base - h)}Z`, roofs);
    s += path(`M${f1(x + w * 0.78)} ${f1(base - h - u * 1.1)}L${f1(x + w + u * 0.3)} ${f1(base - h)}H${f1(x + w * 0.62)}Z`, 'lp-ring') + rect(x, base - h, w, u * 0.16, 'lp-ring');
    s += rect(x - u * 0.2, base - h * 0.52, w + u * 0.4, u * 0.18, 's-midsh');
    for (let i = 0; i < 6; i++) s += rect(x + (w / 6) * i + 1, base - h * 0.52 - u * 0.6, 1.2, u * 0.6, 's-midsh');
    s += windows(x + w * 0.08, base - h * 0.95, w * 0.62, h * 0.36, 2, 1, r, 0) + rect(x + w * 0.16, base - h * 0.4, w * 0.18, h * 0.4, 's-midsh') + win(x + w * 0.48, base - h * 0.36, w * 0.2, h * 0.18);
    return [s, w];
  }
  if (kind === 'shed') { // a slanted roof
    const w = u * (3.6 + r()), h = u * 2.8;
    s += rect(x, base - h, w, h, walls) + rect(x + w * 0.7, base - h, w * 0.3, h, 's-midsh');
    s += path(`M${f1(x)} ${f1(base - h)}H${f1(x + w)}V${f1(base - h - u * 0.55)}Z`, walls); // the wall rises under the high end of the roof
    s += path(`M${f1(x - u * 0.4)} ${f1(base - h + u * 0.2)}L${f1(x + w + u * 0.4)} ${f1(base - h - u * 1.1)}L${f1(x + w + u * 0.4)} ${f1(base - h - u * 0.6)}L${f1(x - u * 0.4)} ${f1(base - h + u * 0.7)}Z`, roofs);
    s += win(x + w * 0.16, base - h * 0.62, w * 0.26, h * 0.3) + rect(x + w * 0.44, base - h * 0.6, w * 0.18, h * 0.6, 's-midsh');
    return [s, w];
  }
  if (kind === 'tank') { // a flat roof with a water tank on legs
    const w = u * (3.8 + r()), h = u * 3.4;
    s += rect(x, base - h, w, h, walls) + rect(x + w * 0.72, base - h, w * 0.28, h, 's-midsh') + rect(x - u * 0.15, base - h - u * 0.25, w + u * 0.3, u * 0.3, 's-midsh');
    const tx = x + w * (0.25 + r() * 0.35);
    s += rect(tx, base - h - u * 1.1, 1.2, u * 0.85, 's-midsh') + rect(tx + u * 1.1, base - h - u * 1.1, 1.2, u * 0.85, 's-midsh');
    s += `<rect x="${f1(tx - u * 0.1)}" y="${f1(base - h - u * 2.1)}" width="${f1(u * 1.4)}" height="${f1(u * 1.05)}" rx="${f1(u * 0.25)}" class="s-roof2"/>`;
    s += windows(x + w * 0.08, base - h * 0.85, w * 0.6, h * 0.5, 2, 2, r, 0.1);
    return [s, w];
  }
  if (kind === 'sarisari') { // a corner store with a striped awning and a counter window
    const w = u * (4 + r() * 0.6), h = u * 2.8;
    s += rect(x, base - h, w, h, walls) + rect(x + w * 0.74, base - h, w * 0.26, h, 's-midsh');
    s += path(`M${f1(x - u * 0.3)} ${f1(base - h)}L${f1(x + w * 0.5)} ${f1(base - h - u * 1.3)}L${f1(x + w + u * 0.3)} ${f1(base - h)}Z`, roofs);
    s += path(`M${f1(x + w * 0.5)} ${f1(base - h - u * 1.3)}L${f1(x + w + u * 0.3)} ${f1(base - h)}H${f1(x + w * 0.5)}Z`, 'lp-ring') + rect(x, base - h, w, u * 0.14, 'lp-ring');
    for (let i = 0; i < 6; i++) s += rect(x - u * 0.3 + ((w + u * 0.6) / 6) * i, base - h * 0.74, (w + u * 0.6) / 6, u * 0.5, i % 2 ? 's-awn2' : 's-awn');
    s += win(x + w * 0.1, base - h * 0.5, w * 0.6, h * 0.24) + rect(x + w * 0.1, base - h * 0.26, w * 0.6, u * 0.16, 's-midsh');
    return [s, w];
  }
  // apartment: three floors with balconies
  const w = u * (4.8 + r()), h = u * 6.2;
  s += rect(x, base - h, w, h, walls) + rect(x + w * 0.76, base - h, w * 0.24, h, 's-midsh') + rect(x - u * 0.15, base - h - u * 0.25, w + u * 0.3, u * 0.3, 's-midsh');
  for (let f = 0; f < 3; f++) {
    const fy = base - h + u * 0.6 + f * h * 0.31;
    s += windows(x + w * 0.06, fy, w * 0.66, h * 0.17, 3, 1, r, 0.15) + rect(x + w * 0.04, fy + h * 0.19, w * 0.7, u * 0.14, 's-midsh');
  }
  return [s, w];
}
// A downtown tower: setbacks, a slanted top, a crown with a spire, or a flat top with rooftop plant; the glass in
// quiet horizontal bands (they light up at night)
function tower(x, base, w, h, r, kind = Math.floor(r() * 4)) {
  const top = base - h;
  let s = '';
  if (kind === 0) {
    s += rect(x, top + h * 0.18, w, h * 0.82, 's-mid') + rect(x + w * 0.12, top + h * 0.06, w * 0.76, h * 0.14, 's-mid') + rect(x + w * 0.26, top, w * 0.48, h * 0.08, 's-mid');
    s += rect(x + w * 0.72, top + h * 0.18, w * 0.28, h * 0.82, 's-midsh') + rect(x + w * 0.64, top + h * 0.06, w * 0.24, h * 0.14, 's-midsh');
  } else if (kind === 1) {
    s += path(`M${f1(x)} ${base}V${f1(top + w * 0.45)}L${f1(x + w)} ${f1(top)}V${base}Z`, 's-mid') + path(`M${f1(x + w * 0.7)} ${base}V${f1(top + w * 0.135)}L${f1(x + w)} ${f1(top)}V${base}Z`, 's-midsh');
  } else if (kind === 2) {
    s += rect(x, top + h * 0.1, w, h * 0.9, 's-mid') + rect(x + w * 0.7, top + h * 0.1, w * 0.3, h * 0.9, 's-midsh');
    s += rect(x - w * 0.05, top + h * 0.08, w * 1.1, h * 0.025, 's-midsh') + rect(x + w * 0.2, top + h * 0.02, w * 0.6, h * 0.06, 's-mid') + rect(x + w * 0.49, top - h * 0.1, 2, h * 0.12, 's-midsh');
  } else {
    s += rect(x, top, w, h, 's-mid2') + rect(x + w * 0.74, top, w * 0.26, h, 's-midsh');
    s += rect(x + w * 0.15, top - h * 0.04, w * 0.3, h * 0.04, 's-midsh') + rect(x + w * 0.55, top - h * 0.06, w * 0.14, h * 0.06, 's-midsh');
  }
  s += rect(x, base - h * 0.07, w, h * 0.07, 'lp-ring'); // the lobby, in the shade of the street
  const bands = Math.max(5, Math.round(h / 12));
  for (let i = 2; i < bands; i++) {
    s += rect(x + w * 0.06, top + (i / bands) * h, w * 0.64, Math.max(1.4, (h / bands) * 0.28), 'lp-band', ` style="--wd:${(winN++ % 29) * 0.06}s"`);
  }
  return s;
}
function skyline(W, H, r, center, spread) { // far buildings: tall around the centre, low sprawl elsewhere
  let s = '';
  for (let x = -10; x < W;) {
    const near = Math.exp(-(((x - center) / spread) ** 2));
    const w = 22 + r() * (near > 0.3 ? 30 : 46);
    const h = H * (0.08 + r() * 0.12 + near * (0.35 + r() * 0.35));
    const top = H - h;
    s += rect(x, top, w, h, 's-far');
    if (near > 0.4 && r() < 0.5) s += rect(x + w * 0.2, top - h * 0.08, w * 0.6, h * 0.08, 's-far');
    if (near > 0.3 && r() < 0.25) s += rect(x + w * 0.48, top - h * 0.16, 2, h * 0.16, 's-far');
    for (let k = 0; k < Math.round(h / 22); k++) if (r() < 0.35) s += win(x + w * (0.15 + r() * 0.6), top + h * (0.12 + r() * 0.8), 3, 3);
    x += w + (near > 0.3 ? r() * 4 : 4 + r() * 14);
  }
  return s;
}

/* ---------- Street things ---------- */
function powerLine(xs, base, h) { // poles with crossarms, wires that sag between them
  let s = '';
  const top = base - h;
  xs.forEach((x) => {
    s += path(`M${f1(x - 2.4)} ${base}L${f1(x - 1.4)} ${f1(top)}H${f1(x + 1.4)}L${f1(x + 2.4)} ${base}Z`, 's-pole');
    s += rect(x - h * 0.11, top + h * 0.06, h * 0.22, 2, 's-pole') + rect(x - h * 0.07, top + h * 0.16, h * 0.14, 1.6, 's-pole');
    s += `<circle cx="${f1(x + h * 0.06)}" cy="${f1(top + h * 0.26)}" r="${f1(h * 0.035)}" class="s-pole"/>`; // the transformer
  });
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a > 400) continue;
    [[-0.1, 0.07, 0.11], [0.1, 0.07, 0.1], [-0.06, 0.17, 0.09]].forEach(([o, y, sag]) => {
      const y0 = top + h * y;
      s += `<path d="M${f1(a + h * o)} ${f1(y0)}Q${f1((a + b) / 2)} ${f1(y0 + (b - a) * sag)} ${f1(b + h * o)} ${f1(y0)}" class="s-wire"/>`;
    });
  }
  return s;
}
function lamp(x, base, h, dir = 1) {
  const top = base - h, hx = x + dir * h * 0.2; // hx: the middle of the lamp head
  return `<path d="M${f1(hx - h * 0.05)} ${f1(top + h * 0.03)}L${f1(hx - h * 0.24)} ${base}H${f1(hx + h * 0.24)}L${f1(hx + h * 0.05)} ${f1(top + h * 0.03)}Z" class="lp-cone"/>`
    + path(`M${f1(x - 2.6)} ${base}L${f1(x - 1.4)} ${f1(top + h * 0.1)}H${f1(x + 1.4)}L${f1(x + 2.6)} ${base}Z`, 's-pole')
    + rect(x - 4.5, base - h * 0.07, 9, h * 0.07, 's-pole')
    + `<path d="M${f1(x)} ${f1(top + h * 0.12)}Q${f1(x)} ${f1(top)} ${f1(x + dir * h * 0.12)} ${f1(top)}H${f1(hx)}" class="s-arm"/>`
    + path(`M${f1(hx - h * 0.09)} ${f1(top + h * 0.02)}Q${f1(hx)} ${f1(top - h * 0.05)} ${f1(hx + h * 0.09)} ${f1(top + h * 0.02)}Z`, 's-pole')
    + rect(hx - h * 0.065, top + h * 0.02, h * 0.13, h * 0.02, 'lp-lamp');
}
function stall(x, base, w, h, colours) { // a carinderia stall: a counter, a striped awning, string lights, a sign
  const top = base - h;
  let s = rect(x, top + h * 0.38, w, h * 0.62, 's-mid') + rect(x + w * 0.72, top + h * 0.38, w * 0.28, h * 0.62, 's-midsh');
  const n = Math.max(4, Math.round(w / 18));
  for (let i = 0; i < n; i++) s += rect(x - w * 0.06 + (w * 1.12 / n) * i, top + h * 0.16, w * 1.12 / n, h * 0.2, colours[i % 2]);
  s += path(`M${f1(x - w * 0.06)} ${f1(top + h * 0.36)}h${f1(w * 1.12)}l${f1(-w * 0.04)} ${f1(h * 0.05)}h${f1(-w * 1.04)}Z`, 's-midsh');
  s += rect(x + w * 0.2, top, w * 0.6, h * 0.14, 's-roof2') + win(x + w * 0.28, top + h * 0.04, w * 0.44, h * 0.06);
  s += win(x + w * 0.1, top + h * 0.46, w * 0.52, h * 0.24) + rect(x + w * 0.06, top + h * 0.72, w * 0.62, h * 0.05, 's-midsh');
  for (let i = 0; i < 8; i++) s += `<circle cx="${f1(x - w * 0.04 + (w * 1.08 / 7) * i)}" cy="${f1(top + h * 0.08 + Math.sin(i * 0.9) * 3)}" r="2.6" class="lp-bulb" style="--wd:${i * 0.07}s"/>`;
  return s;
}
function pavilion(x, base, w) { // the Magellan's Cross pavilion: an octagonal kiosk with a tiled, two-tier roof
  const h = w * 0.95, top = base - h;
  return path(`M${f1(x - w * 0.1)} ${f1(top + h * 0.46)}L${f1(x + w * 0.16)} ${f1(top + h * 0.3)}H${f1(x + w * 0.84)}L${f1(x + w * 1.1)} ${f1(top + h * 0.46)}Z`, 's-roof')
    + path(`M${f1(x + w * 0.14)} ${f1(top + h * 0.3)}L${f1(x + w * 0.5)} ${f1(top + h * 0.02)}L${f1(x + w * 0.86)} ${f1(top + h * 0.3)}Z`, 's-roof2')
    + `<circle cx="${f1(x + w * 0.5)}" cy="${f1(top - h * 0.1)}" r="${f1(w * 0.15)}" class="lp-halo"/>` // Magellan's Cross: wood by day, a soft glow at night
    + rect(x + w * 0.481, top - h * 0.26, w * 0.038, h * 0.3, 's-cross') + rect(x + w * 0.42, top - h * 0.185, w * 0.16, w * 0.038, 's-cross')
    + rect(x, top + h * 0.46, w, h * 0.54, 's-mid') + rect(x + w * 0.72, top + h * 0.46, w * 0.28, h * 0.54, 's-midsh')
    + [0.08, 0.38].map((k) => path(`M${f1(x + w * k)} ${base}V${f1(top + h * 0.66)}Q${f1(x + w * (k + 0.12))} ${f1(top + h * 0.54)} ${f1(x + w * (k + 0.24))} ${f1(top + h * 0.66)}V${base}Z`, 's-midsh')).join('');
}
function church(x, base, w) { // a dome and a bell tower
  const h = w * 0.7;
  return rect(x, base - h, w * 0.7, h, 's-mid') + path(`M${f1(x + w * 0.06)} ${f1(base - h)}A${f1(w * 0.29)} ${f1(w * 0.34)} 0 0 1 ${f1(x + w * 0.64)} ${f1(base - h)}Z`, 's-midsh')
    + rect(x + w * 0.33, base - h - w * 0.4, 2, w * 0.08, 's-midsh')
    + rect(x + w * 0.74, base - h * 1.5, w * 0.24, h * 1.5, 's-mid') + path(`M${f1(x + w * 0.72)} ${f1(base - h * 1.5)}L${f1(x + w * 0.86)} ${f1(base - h * 1.82)}L${f1(x + w)} ${f1(base - h * 1.5)}Z`, 's-roof')
    + win(x + w * 0.8, base - h * 1.3, w * 0.12, h * 0.2) + path(`M${f1(x + w * 0.24)} ${base}V${f1(base - h * 0.4)}Q${f1(x + w * 0.35)} ${f1(base - h * 0.56)} ${f1(x + w * 0.46)} ${f1(base - h * 0.4)}V${base}Z`, 's-midsh');
}
function crane(x, base, h) { // a port gantry crane: legs, a lattice boom, a cab, a hook
  const top = base - h;
  let s = path(`M${f1(x)} ${base}L${f1(x + h * 0.06)} ${f1(top + h * 0.3)}H${f1(x + h * 0.11)}L${f1(x + h * 0.08)} ${base}Z`, 's-crane')
    + path(`M${f1(x + h * 0.4)} ${base}L${f1(x + h * 0.34)} ${f1(top + h * 0.3)}H${f1(x + h * 0.39)}L${f1(x + h * 0.48)} ${base}Z`, 's-crane');
  s += `<path d="M${f1(x + h * 0.04)} ${f1(base - h * 0.04)}L${f1(x + h * 0.37)} ${f1(top + h * 0.36)}M${f1(x + h * 0.43)} ${f1(base - h * 0.04)}L${f1(x + h * 0.08)} ${f1(top + h * 0.36)}" class="s-lattice"/>` + rect(x + h * 0.05, top + h * 0.62, h * 0.38, h * 0.025, 's-crane'); // cross-braced legs
  s += rect(x - h * 0.05, top + h * 0.24, h * 0.58, h * 0.07, 's-crane') + rect(x + h * 0.06, top + h * 0.2, h * 0.86, h * 0.045, 's-crane');
  for (let i = 0; i < 9; i++) s += `<path d="M${f1(x + h * (0.08 + i * 0.09))} ${f1(top + h * 0.2)}l${f1(h * 0.045)} ${f1(h * 0.045)}" class="s-lattice"/>`;
  s += rect(x + h * 0.14, top + h * 0.31, h * 0.12, h * 0.08, 's-box1') + rect(x + h * 0.7, top + h * 0.245, 1.2, h * 0.3, 's-crane') + rect(x + h * 0.66, top + h * 0.54, h * 0.08, h * 0.05, 's-crane');
  return s;
}
function containers(x, base, cols, rows, u, r) { // stacks of shipping containers
  let s = '';
  for (let c = 0; c < cols; c++) {
    const n = 1 + Math.floor(r() * rows);
    for (let k = 0; k < n; k++) {
      const cls = ['s-box1', 's-box2', 's-box3'][Math.floor(r() * 3)];
      s += rect(x + c * u * 2.6, base - (k + 1) * u * 1.05, u * 2.5, u, cls);
      for (let i = 1; i < 5; i++) s += rect(x + c * u * 2.6 + i * u * 0.5, base - (k + 1) * u * 1.05 + 1, 0.8, u - 2, 'lp-ring');
    }
  }
  return s;
}
function ship(x, base, w) { // a cargo ship: a hull with a stripe, a bridge, a funnel
  const h = w * 0.2;
  return path(`M${f1(x)} ${f1(base - h)}H${f1(x + w)}L${f1(x + w * 0.92)} ${f1(base)}H${f1(x + w * 0.05)}Z`, 's-hull') + rect(x + w * 0.02, base - h * 0.72, w * 0.95, h * 0.1, 's-box1')
    + rect(x + w * 0.7, base - h * 2.2, w * 0.2, h * 1.2, 's-mid') + rect(x + w * 0.84, base - h * 2.2, w * 0.06, h * 1.2, 's-midsh') + rect(x + w * 0.74, base - h * 2.75, w * 0.07, h * 0.55, 's-box2')
    + windows(x + w * 0.72, base - h * 2.05, w * 0.12, h * 0.4, 3, 1, () => 1, 0)
    + [0.06, 0.2, 0.34, 0.48].map((k, i) => rect(x + w * k, base - h * 1.5, w * 0.13, h * 0.5, ['s-box2', 's-box3', 's-box1', 's-box2'][i])).join('');
}
function bridge(x, base, w, h, waterTop) { // a cable-stayed bridge: two A-frame pylons, fans of cables, a deck with lights, piers
  const deck = base - h * 0.34;
  let s = '';
  [0.3, 0.7].forEach((k) => {
    const px = x + w * k;
    for (let i = 1; i <= 7; i++) {
      [-1, 1].forEach((d) => { s += `<path d="M${f1(px)} ${f1(base - h + 6 + i * 3)}L${f1(px + d * i * w * 0.026)} ${f1(deck)}" class="s-cable"/>`; });
    }
    s += path(`M${f1(px - h * 0.09)} ${f1(waterTop)}L${f1(px - 2)} ${f1(base - h)}H${f1(px + 2)}L${f1(px + h * 0.09)} ${f1(waterTop)}H${f1(px + h * 0.05)}L${f1(px + 1)} ${f1(deck - h * 0.12)}H${f1(px - 1)}L${f1(px - h * 0.05)} ${f1(waterTop)}Z`, 's-mid');
  });
  s += rect(x, deck, w, h * 0.045, 's-mid') + rect(x, deck + h * 0.045, w, h * 0.025, 's-midsh');
  for (let i = 0; i <= 12; i++) s += path(`M${f1(x + (w / 12) * i - 3)} ${f1(waterTop)}L${f1(x + (w / 12) * i - 2)} ${f1(deck + h * 0.07)}H${f1(x + (w / 12) * i + 2)}L${f1(x + (w / 12) * i + 3)} ${f1(waterTop)}Z`, 's-midsh');
  for (let i = 0; i < 24; i++) s += `<circle cx="${f1(x + (w / 23) * i)}" cy="${f1(deck - 2)}" r="1.4" class="lp-bulb" style="--wd:${(i % 8) * 0.05}s"/>`;
  return s;
}
function water(x, base, w, depth, r) { // the channel, with light on the water
  let s = rect(x, base - depth, w, depth, 's-water');
  for (let i = 0; i < w / 40; i++) s += rect(x + r() * w, base - depth + 4 + r() * (depth - 8), 14 + r() * 30, 1.5, 's-waterhi');
  return s;
}
// The near sidewalk: low things, so they never cover the phones
function bench(x, base, R) {
  const L = R * 1.2, seat = base - R * 0.3, top = base - R * 0.62, t = R * 0.045;
  let s = `<ellipse cx="${f1(x + L / 2)}" cy="${f1(base - 1)}" rx="${f1(L * 0.55)}" ry="${f1(R * 0.03)}" class="lp-ring"/>`;
  s += rect(x + L * 0.06, top, t * 0.8, seat - top, 's-near') + rect(x + L * 0.94 - t * 0.8, top, t * 0.8, seat - top, 's-near'); // back posts
  [0, 1, 2].forEach((i) => { s += rect(x, top + i * t * 1.5, L, t, i ? 's-benchsh' : 's-bench'); }); // backrest slats
  s += rect(x - L * 0.02, seat - t * 1.2, L * 1.04, t * 1.2, 's-bench') + rect(x, seat, L, t * 0.5, 's-benchsh'); // the seat and its front edge
  [0.08, 0.92].forEach((k) => {
    s += path(`M${f1(x + L * k - t)} ${f1(seat)}L${f1(x + L * k - t * 1.6)} ${base}H${f1(x + L * k - t * 0.4)}L${f1(x + L * k)} ${f1(seat)}Z`, 's-near'); // legs
    s += rect(x + L * k - t * 1.4, seat - R * 0.14, t * 2.6, t * 0.8, 's-near') + rect(x + L * k - t * 0.4, seat - R * 0.14, t * 0.8, R * 0.14, 's-near'); // armrests
  });
  return s;
}
function shed(x, base, u) { // a jeepney waiting shed: concrete posts, a curved tin roof with a route sign, a half wall, a bench
  const W = u * 6, top = base - u * 4.2;
  let s = rect(x + u * 0.3, base - u * 1.7, W - u * 0.6, u * 1.7, 's-mid2') + rect(x + W * 0.7, base - u * 1.7, W * 0.3 - u * 0.3, u * 1.7, 's-midsh'); // the half wall
  s += rect(x + u * 0.3, top + u * 0.6, W - u * 0.6, u * 0.4, 'lp-ring'); // the roof's shadow
  s += rect(x + u * 0.8, base - u * 1.05, W - u * 1.6, u * 0.22, 's-bench') + rect(x + u * 1.1, base - u * 0.85, u * 0.18, u * 0.85, 's-benchsh') + rect(x + W - u * 1.3, base - u * 0.85, u * 0.18, u * 0.85, 's-benchsh');
  [0.12, W / u - 0.5].forEach((k) => { s += rect(x + u * k, top + u * 1, u * 0.38, base - top - u, 's-pole'); }); // posts, under the roof
  s += path(`M${f1(x - u * 0.5)} ${f1(top + u * 0.75)}Q${f1(x + W / 2)} ${f1(top - u * 0.55)} ${f1(x + W + u * 0.5)} ${f1(top + u * 0.75)}V${f1(top + u * 1.2)}Q${f1(x + W / 2)} ${f1(top - u * 0.05)} ${f1(x - u * 0.5)} ${f1(top + u * 1.2)}Z`, 's-roof2');
  for (let i = 1; i < 6; i++) s += rect(x - u * 0.3 + ((W + u * 0.6) / 6) * i, top + u * 0.1 + Math.abs(i - 3) * u * 0.14, 1, u * 0.5, 'lp-ring'); // ribs in the tin
  s += rect(x + W * 0.28, top + u * 1.05, W * 0.44, u * 0.55, 's-box1') + rect(x + W * 0.33, top + u * 1.22, W * 0.34, u * 0.08, 'lp-ring') + rect(x + W * 0.36, top + u * 1.36, W * 0.24, u * 0.07, 'lp-ring'); // the route sign
  return s;
}
const bollard = (x, base, u) => `<rect x="${f1(x)}" y="${f1(base - u * 1.6)}" width="${f1(u * 0.7)}" height="${f1(u * 1.6)}" rx="${f1(u * 0.3)}" class="s-near"/>`;
function grass(x, base, u, r) { // a clump of blades of different heights
  const n = 3 + Math.floor(r() * 4);
  let d = `M${f1(x)} ${base}`;
  for (let i = 0; i < n; i++) d += `l${f1(u * 0.3)} ${f1(-u * (0.7 + r() * 0.9))}L${f1(x + u * 0.42 * (i + 1))} ${base}`;
  return path(d + 'Z', 's-leafsh');
}
function rock(x, base, size, r) {
  const w = size * (1.3 + r() * 0.6), h = size * (0.7 + r() * 0.3), k = 0.4 + r() * 0.2;
  return `<ellipse cx="${f1(x + w * 0.55)}" cy="${f1(base - 1)}" rx="${f1(w * 0.62)}" ry="${f1(Math.max(1.5, h * 0.08))}" class="lp-ring"/>`
    + path(`M${f1(x)} ${base}Q${f1(x - w * 0.02)} ${f1(base - h * 0.7)} ${f1(x + w * 0.3)} ${f1(base - h * 0.95)}Q${f1(x + w * k + w * 0.15)} ${f1(base - h * 1.1)} ${f1(x + w * 0.78)} ${f1(base - h * 0.72)}Q${f1(x + w * 1.02)} ${f1(base - h * 0.45)} ${f1(x + w)} ${base}Z`, 's-rock')
    + path(`M${f1(x + w * 0.1)} ${f1(base - h * 0.6)}Q${f1(x + w * 0.22)} ${f1(base - h * 0.96)} ${f1(x + w * 0.52)} ${f1(base - h * 0.97)}Q${f1(x + w * 0.34)} ${f1(base - h * 0.78)} ${f1(x + w * 0.1)} ${f1(base - h * 0.6)}Z`, 's-rockhi')
    + path(`M${f1(x + w * 0.4)} ${base}Q${f1(x + w * 0.84)} ${f1(base - h * 0.18)} ${f1(x + w * 0.86)} ${f1(base - h * 0.64)}Q${f1(x + w * 1.02)} ${f1(base - h * 0.42)} ${f1(x + w)} ${base}Z`, 'lp-ring')
    + grass(x - size * 0.15, base, size * 0.35, r);
}
function shrub(x, base, w, r) { // a low green mound, no flowers
  const n = 3 + Math.floor(r() * 3);
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f1(x + w * (0.15 + (0.7 * i) / (n - 1)))}" cy="${f1(base - w * (0.12 + r() * 0.12))}" r="${f1(w * (0.16 + r() * 0.1))}" class="${i % 2 ? 's-leaf' : 's-leafsh'}"/>`;
  return s + rect(x + w * 0.05, base - w * 0.12, w * 0.9, w * 0.12, 's-leafsh');
}
const svg = (w, h, inner) => `<svg xmlns="${SVG}" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}">${inner}</svg>`;

/* ---------- The layers ---------- */
function farLayer(W, H, at) {
  const r = rnd(7);
  const down = at.vw * 0.5 + at.marks[1] * at.shift; // downtown sits behind the noon stop
  // the far range (hazy, tallest), the near range (lower, rounder), then the skyline
  let s = path(ridge(W, H, { base: 0.42, amp: H * 0.22, seed: 17, peaks: [{ x: down + at.vw * 0.15, h: H * 0.24, w: at.vw * 0.18 }, { x: W * 0.12, h: H * 0.12, w: at.vw * 0.12 }, { x: W * 0.82, h: H * 0.16, w: at.vw * 0.2 }] }), 's-mtn');
  s += path(ridge(W, H, { base: 0.62, amp: H * 0.12, rough: 0.5, seed: 29, peaks: [{ x: down - at.vw * 0.3, h: H * 0.08, w: at.vw * 0.25 }] }), 's-hill');
  s += skyline(W, H, r, down, at.vw * 0.45);
  return svg(W, H, s);
}
function midLayer(W, H, at) {
  const r = rnd(11);
  const base = H, u = H / 10;
  const [vw] = at.vw;
  const X = (k, p) => k * vw + p * at.shift; // a spot k (0…1 across the screen) when the day is at p
  const back = [], front = [];
  // homes, trees and palms between landmarks, never the same twice in a row
  let last = '';
  const street = (from, to, dense = 1) => {
    for (let x = from; x < to;) {
      const roll = r();
      if (roll < 0.12 / dense) { front.push(palm(x + 8, base, H * (0.55 + r() * 0.3), r)); x += u * 2.2; continue; }
      if (roll < 0.26 / dense) { back.push(tree(x + u * 2, base, H * (0.42 + r() * 0.16), r)); x += u * 3.8; continue; }
      if (roll < 0.3 / dense) { front.push(banana(x + u, base, H * 0.3)); x += u * 2; continue; }
      let kind = HOUSES[Math.floor(r() * HOUSES.length)];
      if (kind === last) kind = HOUSES[(HOUSES.indexOf(kind) + 1) % HOUSES.length];
      last = kind;
      const [svgH, w] = house(kind, x, base, u * (0.9 + r() * 0.2), r);
      back.push(svgH);
      x += w + u * (0.3 + r() * 0.8);
    }
  };
  // Morning: homes
  street(-200, X(0.9, at.marks[0]));
  front.push(shed(X(0.62, at.marks[0]), base, u));
  // Noon: downtown towers, with palms in planters
  const n0 = X(0.02, at.marks[1]);
  street(X(0.9, at.marks[0]), n0, 2);
  let tx = n0;
  for (let i = 0; i < 8; i++) {
    const w = u * (5 + r() * 2.6), h = H * (0.62 + r() * 0.36) * (i === 3 || i === 5 ? 1.15 : 1);
    if (tx + w > X(0.0, at.marks[2]) - u * 2) break; // downtown ends before the port
    back.push(tower(tx, base, w, Math.min(h, H * 0.98), r));
    tx += w + u * (0.4 + r() * 0.8);
  }
  for (let x = n0 + u * 2; x < tx - u; x += u * (6 + r() * 4)) front.push(palm(x, base, H * (0.45 + r() * 0.15), r));
  street(tx + u * 2, X(0.0, at.marks[2]) - u * 2, 2);
  // Golden hour: the port on the water, then the bridge
  const g0 = X(0.0, at.marks[2]);
  const narrow = vw < 600; // a phone has no room for a docked ship between the cranes and the bridge
  const b0 = Math.max(X(0.4, at.marks[2]), g0 + u * (narrow ? 14 : 24.5)); // the quay (containers, cranes, a docked ship) ends before the bridge
  const bw = vw * 0.45;
  const waterTop = base - u * 0.9;
  const e0 = X(0.28, 1); // home again: where the pavilion stands at the end of the day
  const wEnd = b0 + bw + u * 4;
  back.push(water(g0 - u * 2, base, wEnd - g0 + u * 2, u * 0.9, r));
  back.push(containers(g0, waterTop, 4, 3, u * 0.8, r), crane(g0 + u * 1.5, waterTop, H * 0.66), crane(g0 + u * 8, waterTop, H * 0.56));
  if (!narrow) back.push(ship(g0 + u * 12, waterTop + u * 0.5, u * 11)); // docked under the second crane's boom
  back.push(bridge(b0, base, bw, H * 0.86, waterTop));
  // Night: the carinderia street
  const d0 = Math.max(wEnd + u * 2, X(0.12, at.marks[3]));
  const awnings = [['s-awn', 's-awn2'], ['s-awnp', 's-awn2'], ['s-awnr', 's-awn2']];
  let sx = d0;
  for (let i = 0; i < 5 && sx + u * 9 < e0 - u * 4; i++) { // the stalls stop short of the pavilion
    const w = u * (6 + r() * 3);
    back.push(stall(sx, base, w, H * (0.34 + r() * 0.06), awnings[i % 3]));
    sx += w + u * 1.2;
    if (i % 2 && sx + u * 6 < e0 - u * 4) { const [svgH, hw] = house(HOUSES[(i + 2) % HOUSES.length], sx, base, u, r); back.push(svgH); sx += hw + u; }
  }
  street(sx + u, Math.min(X(0.22, 1), e0 - u * 4));
  // Home again: the pavilion and the church, between palms
  if (e0 - u * 3 > wEnd) front.push(palm(e0 - u * 2, base, H * 0.7, r)); // never on the water
  back.push(pavilion(e0, base, u * 8), church(e0 + u * 13, base, u * 7.5)); // sized to stand under the layer's top
  front.push(palm(e0 + u * 10.5, base, H * 0.62, r));
  front.push(shed(e0 + u * 24, base, u));
  street(e0 + u * 31, W + 100);
  // Power poles along the street (not over the water), and street lamps at uneven gaps
  const poles = [];
  for (let x = 40; x < W; x += u * (16 + r() * 8)) if (x < g0 - u * 3 || x > wEnd + u) poles.push(x);
  const lamps = [];
  for (let x = 160; x < W; x += u * (24 + r() * 22)) if (x < g0 - u * 3 || x > wEnd + u) lamps.push(lamp(x, base, H * 0.66, r() < 0.5 ? 1 : -1));
  return svg(W, H, back.join('') + front.join('') + powerLine(poles, base, H * 0.72) + lamps.join(''));
}
function nearLayer(W, H, at) {
  const r = rnd(5);
  const R = at.rider; // the rider's height on screen
  const u = H / 10, base = H;
  let s = '';
  for (let x = 60; x < W;) {
    const roll = r();
    if (roll < 0.22) { s += bougainvillea(x, base, u * (5 + r() * 6), r); x += u * 12; }
    else if (roll < 0.34) { s += shrub(x, base, u * (5 + r() * 5), r); x += u * 10; }
    else if (roll < 0.44) { s += rock(x, base, u * (2.6 + r() * 2), r) + rock(x + u * 5.2, base, u * (1.3 + r()), r); x += u * 9; }
    else if (roll < 0.62) { s += bench(x, base, R); x += R * 1.4; }
    else if (roll < 0.82) { for (let i = 0; i < 3; i++) s += bollard(x + i * u * 2.2, base, u); x += u * 8; }
    else { s += grass(x, base, u * 1.4, r) + grass(x + u * 3, base, u, r); x += u * 6; }
    x += u * (14 + r() * 26);
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

/* ---------- The hero's city at dawn, and the closing panel's at night ---------- */
export function heroCity(W, H, seed = 21) {
  const r = rnd(seed);
  winN = 0;
  let s = path(ridge(W, H, { base: 0.36, amp: H * 0.2, seed: seed + 3, peaks: [{ x: W * 0.62, h: H * 0.22, w: W * 0.12 }, { x: W * 0.2, h: H * 0.1, w: W * 0.1 }] }), 's-mtn');
  s += path(ridge(W, H, { base: 0.55, amp: H * 0.1, rough: 0.5, seed: seed + 7 }), 's-hill');
  s += skyline(W, H, r, W * 0.55, W * 0.28);
  for (let x = 30; x < W; x += 140 + r() * 260) s += palm(x, H, H * (0.45 + r() * 0.3), r, 's-palm', 's-palm');
  return svg(W, H, s);
}

/* ---------- Clouds: 3–6 puffs of different sizes on a flat base, with a soft shaded underside ---------- */
function cloud(r) {
  const n = 3 + Math.floor(r() * 4), flat = 0.55 + r() * 0.45;
  let puffs = '';
  for (let i = 0; i < n; i++) {
    const mid = 1 - Math.abs(i - (n - 1) / 2) / n; // taller toward the middle, never quite even
    const rr = 6 + r() * 6 + mid * 9;
    puffs += `<circle cx="${f1(14 + (72 * (i + 0.5)) / n + (r() - 0.5) * 8)}" cy="${f1(34 - rr * flat)}" r="${f1(rr)}"/>`;
  }
  const body = `${puffs}<rect x="6" y="25" width="88" height="10" rx="5"/>`;
  return `<svg viewBox="0 -12 100 50" aria-hidden="true"><g class="lp-cloud__sh" transform="translate(0 2.6)">${body}</g><g class="lp-cloud__lit">${body}</g></svg>`;
}
const CLOUDS = [['6%', '24vmin', '160s', '-30s'], ['44%', '13vmin', '120s', '-90s'], ['0%', '17vmin', '140s', '-62s'], ['64%', '32vmin', '190s', '-150s']];

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
    scene.innerHTML = `<div class="lp-scene__sky"></div><div class="lp-scene__stars"></div><div class="lp-scene__clouds">${CLOUDS.map(([y, w, t, d], i) => `<i style="--y:${y};--w:${w};--t:${t};--d:${d}">${cloud(rnd(40 + i * 7))}</i>`).join('')}</div><span class="lp-scene__sun"></span><span class="lp-scene__moon"></span>
      <svg class="lp-scene__birds" viewBox="0 0 120 40" width="120" height="40"><path d="M4 20q8-8 16 0q8-8 16 0"/><path d="M50 8q6-6 12 0q6-6 12 0"/><path d="M84 28q7-7 14 0q7-7 14 0"/></svg>
      <div class="lp-layer lp-layer--far"></div><div class="lp-scene__haze"></div><div class="lp-layer lp-layer--mid"></div><div class="lp-scene__jeep"></div>`;
    const near = document.createElement('div');
    near.className = 'lp-layer lp-layer--near';
    near.setAttribute('aria-hidden', 'true');
    pin.prepend(scene);
    pin.append(near);
    const stars = scene.querySelector('.lp-scene__stars');
    const r = rnd(3);
    stars.innerHTML = Array.from({ length: 40 }, () => `<i style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 55).toFixed(1)}%;--s:${(1 + r() * 1.6).toFixed(1)}px"></i>`).join('');
    els = { sky: scene.querySelector('.lp-scene__sky'), haze: scene.querySelector('.lp-scene__haze'), scene, near, far: scene.querySelector('.lp-layer--far'), mid: scene.querySelector('.lp-layer--mid'), jeep: scene.querySelector('.lp-scene__jeep'), sun: scene.querySelector('.lp-scene__sun'), moon: scene.querySelector('.lp-scene__moon'), birds: scene.querySelector('.lp-scene__birds'), clouds: scene.querySelector('.lp-scene__clouds'), stars };
  }
  state = { slide, marks, vw, vh };
  const k = `${Math.round(slide)}|${vw}|${vh}`;
  if (k === key) return;
  key = k;
  winN = 0;
  const small = vw < 600;
  const farH = vh * (small ? 0.32 : 0.44), midH = vh * (small ? 0.26 : 0.36), nearH = Math.min(96, vh * 0.11);
  els.far.innerHTML = farLayer(vw + slide * FAR + 40, farH, { vw, shift: slide * FAR, marks });
  els.mid.innerHTML = midLayer(vw + slide * MID + 200, midH, { vw: [vw], shift: slide * MID, marks });
  els.near.innerHTML = nearLayer(vw + slide * NEAR + 200, nearH, { vw, rider: small ? vh * 0.12 : Math.min(vh * 0.2, 190) }); // as css/landing.css sizes .lp-day__rider
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
  // The sky (and the haze over the far city) blend smoothly: screen-sized boxes, cheap to repaint. The city's
  // colours change only at a few moments of the day (redrawing the wide city every frame slows phones down).
  const skyA = mix(TIMES[a][0], TIMES[b][0], t), skyB = mix(TIMES[a][1], TIMES[b][1], t);
  els.sky.style.setProperty('--c-skyA', skyA);
  els.sky.style.setProperty('--c-skyB', skyB);
  els.haze.style.setProperty('--c-skyB', skyB);
  const time = t < 0.5 ? a : b;
  if (time !== band) {
    band = time;
    pin.dataset.band = time; // css/landing.css grades the rider to the hour
    Object.entries(palette(time)).forEach(([k, v]) => pin.style.setProperty(`--c-${k}`, v));
  }
  // Sun across the sky until dusk, then the moon and the stars
  const day = Math.min(1, p / dusk);
  const nightness = Math.min(1, Math.max(0, (p - (marks[2] + dusk) / 2) / (marks[3] - (marks[2] + dusk) / 2)));
  els.sun.style.transform = `translate3d(${f1(vw * (0.1 + day * 0.74))}px,${f1(vh * (0.5 - Math.sin(day * Math.PI) * 0.36 + day * day * 0.12))}px,0)`;
  els.sun.style.opacity = String(1 - nightness);
  els.sun.style.setProperty('--warm', day.toFixed(3));
  els.moon.style.opacity = els.stars.style.opacity = nightness.toFixed(3);
  els.clouds.style.opacity = String(1 - nightness * 0.75);
  els.birds.style.opacity = String(Math.max(0, 1 - p / marks[1]));
  const isNight = p >= dusk;
  if (isNight !== night) { night = isNight; pin.classList.toggle('is-lit', isNight); }
}
