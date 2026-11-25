// mysabak isometric vehicles: bodies built from cross-sections ("stations") along the vehicle, joined into a solid
// shell, then lit per surface by the direction it faces. Wheels are real cylinders: tyre tread, sidewall and a recessed
// rim. Everything is projected to flat SVG paths (no 3D models, no images).
// Run: node dev/iso-vehicles.mjs   → assets/images/iso/{moto,car,suv,van,truck,fleet}.svg
import { mkdirSync, writeFileSync } from 'node:fs';

/* ---------- Camera and light (shared by every vehicle) ---------- */
// One isometric camera: x along the vehicle (front = +x, toward the bottom right), y across it (+y = the near side,
// toward the bottom left), z up. The viewer looks from (1, 1, 1).
const C30 = Math.cos(Math.PI / 6);
export const project = ([x, y, z]) => [(x - y) * C30, (x + y) * 0.5 - z];
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const VIEW = unit([1, 1, 1]);
// Light from the upper left of the picture, a little from the front: roofs bright, the near side lit, the front in shade
const LIGHT = unit([-0.15, 0.55, 0.82]);
const HALF = unit(LIGHT.map((v, i) => v + VIEW[i]));

// convex hull of 2D points
function hull2(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (const q of p.reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/* ---------- Colour ---------- */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
// Materials: how a surface answers the light. ambient + diffuse + a little fill from the viewer, then a specular gleam
export const MAT = {
  paint: { base: '#6a2fb0', amb: 0.5, dif: 0.58, fill: 0.16, spec: 0.24, shine: 26 },
  glass: { base: '#251838', amb: 0.62, dif: 0.3, fill: 0.1, spec: 0.55, shine: 9 },
  trim: { base: '#2c2240', amb: 0.62, dif: 0.35, fill: 0.1, spec: 0.12, shine: 12 }, // bumpers, sills: dark satin plastic
  gold: { base: '#f2bf5e', amb: 0.62, dif: 0.45, fill: 0.12, spec: 0.35, shine: 18 },
  rubber: { base: '#231a30', amb: 0.62, dif: 0.32, fill: 0.08, spec: 0.08, shine: 6 },
  metal: { base: '#ece7f4', amb: 0.62, dif: 0.45, fill: 0.15, spec: 0.5, shine: 26 },
  lamp: { base: '#fff1cc', amb: 1, dif: 0, fill: 0, spec: 0, shine: 1 },
  well: { base: '#170f22', amb: 1, dif: 0, fill: 0, spec: 0, shine: 1 }, // inside a wheel arch: no light reaches it
};
function lit(mat, n) {
  const m = MAT[mat];
  const k = m.amb + m.dif * Math.max(0, dot(n, LIGHT)) + m.fill * Math.max(0, dot(n, VIEW));
  const c = rgb(m.base).map((v) => v * k);
  const s = m.spec * Math.max(0, dot(n, HALF)) ** m.shine;
  return hex(c.map((v) => v + (255 - v) * s));
}

/* ---------- Drawing: faces sorted back to front ---------- */
class Drawing {
  constructor(center, id = 'v') { this.faces = []; this.n = 0; this.center = center; this.id = id; this.clips = []; }
  // a clip region from 3D points (their projected convex hull); returns its id
  clip(pts3) {
    const id = `${this.id}-c${this.clips.length}`;
    this.clips.push({ id, pts: hull2(pts3.map(project)) });
    return id;
  }
  // a flat face from 3D points; mat: a material (lit by its normal) or a fixed colour (#…)
  add(pts, mat, { bias = 0, opacity, cull = true, blur = 0, clip } = {}) {
    if (pts.length < 3) return;
    // Newell's normal: from every edge, so faces with a repeated corner (a band narrowing to a point) still face the right way
    const nw = [0, 0, 0];
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; nw[0] += (p[1] - q[1]) * (p[2] + q[2]); nw[1] += (p[2] - q[2]) * (p[0] + q[0]); nw[2] += (p[0] - q[0]) * (p[1] + q[1]); });
    if (Math.hypot(...nw) < 1e-9) return; // no area at all
    let n = unit(nw);
    const c = pts.reduce((s, p) => s.map((v, i) => v + p[i]), [0, 0, 0]).map((v) => v / pts.length);
    if (dot(n, sub(c, this.center)) < 0) n = n.map((v) => -v); // outward
    if (cull && dot(n, VIEW) <= 1e-4) return; // facing away
    const area = Math.abs(pts.map(project).reduce((s, p, i, a) => { const q = a[(i + 1) % a.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0));
    if (area < 0.02) return; // edge-on
    this.faces.push({ pts, fill: mat.startsWith('#') || mat.startsWith('rgba') ? mat : lit(mat, n), opacity, blur, clip, depth: c[0] + c[1] + c[2] + bias, i: this.n++ });
  }
  paths() {
    let open = null; // the clip group we're in
    const out = this.faces.sort((a, b) => a.depth - b.depth || a.i - b.i).map((f) => {
      let pre = '';
      if (f.clip !== open) { pre = `${open ? '</g>' : ''}${f.clip ? `<g clip-path="url(#${f.clip})">` : ''}`; open = f.clip; }
      return pre + this.path(f);
    }).join('');
    return out + (open ? '</g>' : '');
  }
  path(f) {
    {
      const d = f.pts.map(project).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
      if (f.blur) return `<path d="${d}" fill="${f.fill}" filter="url(#${this.id}-b${f.blur})"/>`;
      const solid = !f.opacity && f.fill.startsWith('#');
      return `<path d="${d}" fill="${f.fill}"${f.opacity ? ` fill-opacity="${f.opacity}"` : ''}${solid ? ` stroke="${f.fill}" stroke-width="0.6" stroke-linejoin="round"` : ''}/>`;
    }
  }
  defs() {
    const sizes = [...new Set(this.faces.filter((f) => f.blur).map((f) => f.blur))];
    const clips = this.clips.map((c) => `<clipPath id="${c.id}"><path d="${c.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}Z"/></clipPath>`).join('');
    return sizes.length || clips ? `<defs>${sizes.map((b) => `<filter id="${this.id}-b${b}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${b}"/></filter>`).join('')}${clips}</defs>` : '';
  }
  svg(pad = 12) {
    const all = this.faces.flatMap((f) => f.pts.map(project));
    const x0 = Math.min(...all.map((p) => p[0])) - pad; const y0 = Math.min(...all.map((p) => p[1])) - pad;
    const w = Math.max(...all.map((p) => p[0])) - x0 + pad; const h = Math.max(...all.map((p) => p[1])) - y0 + pad;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}">${this.defs()}${this.paths()}</svg>`;
  }
}

/* ---------- The body shell: rings of points along the vehicle, joined band by band ---------- */
// A station is a cross-section at x: sill (z0, half width a), shoulder (z1, b), belt/window line (z2, c), roof (z3, d).
// Each ring runs far sill → shoulder → pinstripe → belt → roof → and back down the near side.
const RING = ['farSill', 'farLow', 'farStripe', 'farShoulder', 'farGlass', 'farRoofEdge', 'roof', 'nearRoofEdge', 'nearGlass', 'nearShoulder', 'nearStripe', 'nearLow', 'nearSill', 'bottom'];
function ring(st, cy) {
  const { x, z0, a, z1, b, z2, c, z3, d } = st;
  // the roof edge rounds over: a point just below and outside the roof line (flat where there's no cabin)
  const e = d + (c - d) * 0.07; const ze = z3 - (z3 - z2) * 0.06; const r = z3 > z2 + 1 ? 1.2 : 0;
  const half = [[a, z0], [a + 1.6, z0 + 6], [b, z1], [b, z1 + 1.8], [c, z2], [e, ze], [d - r, z3]];
  return [...half.map(([w, z]) => [x, cy - w, z]), ...half.reverse().map(([w, z]) => [x, cy + w, z])];
}
// stations: sorted by x; material(band, x0, x1): which material each band between two stations gets
function shell(g, stations, cy, material) {
  const rings = stations.map((s) => ring(s, cy));
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i]; const B = rings[i + 1];
    for (let j = 0; j < 14; j++) {
      const k = (j + 1) % 14;
      g.add([A[j], B[j], B[k], A[k]], material(RING[j], stations[i].x, stations[i + 1].x));
    }
  }
  // the nose: the front ring closed into a face
  g.add(rings.at(-1).slice().reverse(), material('nose', stations.at(-1).x, stations.at(-1).x));
}
// linear blend between two stations, for extra stations (pillars, door seams) in between
const between = (s0, s1, x) => { const t = (x - s0.x) / (s1.x - s0.x); return Object.fromEntries(Object.keys(s0).map((k) => [k, s0[k] + (s1[k] - s0[k]) * t])); };

/* ---------- Wheels: tyre, sidewall, recessed rim with spokes ---------- */
function wheel(g, { x, z, r, yOut, w = 11, far = false, opening }) {
  const circle = (rad, y, n = 36) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [x + rad * Math.cos(t), y, z + rad * Math.sin(t)]; });
  const yIn = yOut - w;
  const bias = far ? -400 : 1e4;
  const clip = far ? undefined : opening;
  // the tread: quads between the inner and outer tyre circles, each lit by its own normal (round, not flat)
  const o = circle(r, yOut); const inn = circle(r, yIn);
  for (let i = 0; i < o.length; i++) {
    const j = (i + 1) % o.length;
    g.add([inn[i], inn[j], o[j], o[i]], 'rubber', { bias, clip });
  }
  if (far) return;
  // the sidewall, a slightly lighter band, then the rim set into it
  g.add(o, lit('rubber', [0, 1, 0]), { bias: bias + 40, cull: false, clip });
  g.add(circle(r * 0.88, yOut + 0.05), mix(lit('rubber', [0, 1, 0]), '#6a5d80', 0.3), { bias: bias + 41, cull: false, clip }); // the sidewall's bulge catching light
  g.add(circle(r * 0.66, yOut + 0.1), '#0f0918', { bias: bias + 42, cull: false, clip }); // the gap round the rim
  const rimY = yOut - 1.6; // the rim face sits back inside the tyre
  g.add(circle(r * 0.62, rimY), lit('metal', [0, 1, 0]), { bias: bias + 43, cull: false, clip });
  // five spokes: darker wedges between them read as openings
  for (let s = 0; s < 5; s++) {
    const t0 = (s / 5) * Math.PI * 2 + 0.35; const t1 = t0 + 0.5;
    const p = (rad, t) => [x + rad * Math.cos(t), rimY + 0.05, z + rad * Math.sin(t)];
    g.add([p(r * 0.24, t0), p(r * 0.52, t0 - 0.04), p(r * 0.52, t1 + 0.04), p(r * 0.24, t1)], '#6d6087', { bias: bias + 44, cull: false, clip });
  }
  g.add(circle(r * 0.16, rimY + 0.1, 16), '#8f82a6', { bias: bias + 45, cull: false, clip });
  // a soft contact shadow where the tyre meets the ground
  g.add(Array.from({ length: 20 }, (_, i) => { const t = (i / 20) * Math.PI * 2; return [x + r * 0.8 * Math.cos(t), (yIn + yOut) / 2 + 6 * Math.sin(t), 0.02]; }), 'rgba(20, 8, 36, 0.55)', { bias: -1e5, cull: false, blur: 2 });
}
// the wheel opening: the arch and everything below the sill, between the tyre's inner and outer faces
function opening(g, { x, z, r, y, w = 11 }) {
  const arch = (yy) => [...Array.from({ length: 22 }, (_, i) => { const t = Math.PI * (i / 21); return [x + r * Math.cos(t), yy, z + r * 0.98 * Math.sin(t)]; }), [x + r, yy, -8], [x - r, yy, -8]];
  return g.clip(arch(y)); // only the opening itself: the tyre's top stays hidden behind the fender
}
// the dark wheel well behind a near wheel, cut into the side
function well(g, { x, z, r, y }) {
  const pts = Array.from({ length: 22 }, (_, i) => { const t = Math.PI * (i / 21); return [x + r * Math.cos(t), y, z + r * 0.98 * Math.sin(t)]; });
  g.add([[x + r, y, z - 4], ...pts, [x - r, y, z - 4]], 'well', { bias: 30, cull: false });
}
// soft ground shadow: a few stacked footprints, each a little larger and fainter
function ground(g, x0, x1, y0, y1) {
  g.add([[x0 - 2, y0, 0], [x1 + 10, y0, 0], [x1 + 10, y1 + 8, 0], [x0 - 2, y1 + 8, 0]], 'rgba(30, 12, 52, 0.16)', { bias: -2e5, cull: false, blur: 7 });
  g.add([[x0 + 6, y0 + 4, 0], [x1 - 4, y0 + 4, 0], [x1 - 4, y1 - 2, 0], [x0 + 6, y1 - 2, 0]], 'rgba(20, 8, 36, 0.35)', { bias: -1.9e5, cull: false, blur: 3 });
}

/* ---------- Shared building blocks ---------- */
// insert stations at these x positions (pillars, seams), blended from their neighbours
function withStations(K, xs) {
  const st = [...K];
  for (const x of xs) { const i = st.findIndex((s) => s.x > x); if (i > 0 && st[i - 1].x !== x) st.splice(i, 0, between(st[i - 1], st[i], x)); }
  return st;
}
const within = (x0, x1, ranges) => ranges.some(([a, b]) => x0 >= a && x1 <= b);
// The usual body materials: glass where asked, a thin gold pinstripe, door seams, dark cladding along the sill
function bodyMaterial({ roofGlass = [], sideGlass = [], stripe = null, seams = [], cladding = false, seamBands = ['nearLow', 'nearShoulder'] }) {
  return (band, x0, x1) => {
    if (band === 'roof' && within(x0, x1, roofGlass)) return 'glass';
    if ((band === 'nearGlass' || band === 'farGlass') && within(x0, x1, sideGlass)) return 'glass';
    if (stripe && (band === 'nearStripe' || band === 'farStripe') && within(x0, x1, [stripe])) return 'gold';
    if (seamBands.includes(band) && within(x0, x1, seams.map((s) => [s, s + 0.8]))) return '#3f1a6e';
    if (cladding && (band === 'nearSill' || band === 'farSill')) return 'trim';
    return 'paint';
  };
}
const seamStations = (seams) => seams.flatMap((s) => [s, s + 0.8]);
// a box (bumpers, mirrors, rails, cargo): six faces, the hidden ones culled
function box(g, [x0, y0, z0], [x1, y1, z1], mat, opts = {}) {
  const f = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
    [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  ];
  const save = g.center; g.center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  for (const pts of f) g.add(pts, mat, opts);
  g.center = save;
}
// something painted on the near side (plane y), points in x–z; or on the front (plane x), points in y–z
const onSide = (g, y, pts, mat, bias = 600) => g.add(pts.map(([x, z]) => [x, y, z]), mat, { bias, cull: false });
const onFront = (g, x, cy, pts, mat, bias = 600) => g.add(pts.map(([y, z]) => [x, cy + y, z]), mat, { bias, cull: false });
// the nose: bumper, grille, number plate and two headlights on the front face
function nose(g, { F, cy, half, z, grilleW = 13, grilleH = 5, lampW = 11, lampH = 4, lampIn = 4 }) {
  onFront(g, F, cy, [[-half, z], [half, z], [half, z + 5], [-half, z + 5]], lit('trim', [1, 0, 0]), 500);
  onFront(g, F, cy, [[-grilleW, z + 6], [grilleW, z + 6], [grilleW, z + 6 + grilleH], [-grilleW, z + 6 + grilleH]], '#140c1f', 500);
  onFront(g, F, cy, [[-7, z + 1], [7, z + 1], [7, z + 4.2], [-7, z + 4.2]], '#f4f0f8', 501);
  for (const s of [-1, 1]) {
    const y0 = s * (half - lampIn - lampW); const y1 = s * (half - lampIn); const zl = z + 6 + grilleH - lampH + 0.5;
    onFront(g, F, cy, [[y0, zl - 0.8], [y1, zl - 0.8], [y1 + s, zl + lampH + 0.8], [y0, zl + lampH + 0.8]], '#3a2d52', 501);
    onFront(g, F, cy, [[y0 + s * 1.2, zl], [y1 - s * 0.4, zl], [y1 + s * 0.2, zl + lampH], [y0 + s * 1.2, zl + lampH]], 'lamp', 502);
  }
}
// a soft reflection band across a sloped windscreen. at(u, v): a point on the glass (u 0→1 top→bottom, v far→near)
function reflection(g, at) {
  g.add([at(0.08, 0.05), at(0.3, 0.05), at(0.78, 0.95), at(0.56, 0.95)].map((p) => [p[0], p[1], p[2] + 0.15]), 'rgba(255, 255, 255, 0.14)', { bias: 600, cull: false });
  g.add([at(0.36, 0.05), at(0.44, 0.05), at(0.92, 0.95), at(0.84, 0.95)].map((p) => [p[0], p[1], p[2] + 0.15]), 'rgba(255, 255, 255, 0.08)', { bias: 601, cull: false });
}
// the windscreen surface between two stations (for its reflection)
const screen = (s0, s1, cy) => (u, v) => {
  const x = s0.x + (s1.x - s0.x) * u; const z = s0.z3 + (s1.z3 - s0.z3) * u; const hw = s0.d + (s1.d - s0.d) * u;
  return [x, cy - hw + 2 * hw * v, z];
};
// a near-side mirror
function mirror(g, x, y, z) {
  g.add([[x, y, z], [x + 4, y, z], [x + 4, y + 5, z + 1.5], [x, y + 5, z + 1.5]], '#3a2d52', { bias: 800 });
  g.add([[x, y + 5, z + 1.5], [x + 4, y + 5, z + 1.5], [x + 4, y + 5, z + 5], [x, y + 5, z + 5]], '#2c2240', { bias: 801 });
  g.add([[x + 4, y, z], [x + 4, y + 5, z + 1.5], [x + 4, y + 5, z + 5], [x + 4, y, z + 3.5]], '#211a30', { bias: 802 });
}
// a car-like vehicle: ground, far wheels, body, wells, near wheels (each cut to its opening)
function carBody(g, { L, W, stations, material, wheels, R, wellY, tyreY }) {
  const cy = W / 2;
  ground(g, 6, L - 4, 3, W + 2);
  for (const x of wheels) wheel(g, { x, z: R, r: R, yOut: 12, far: true });
  shell(g, stations, cy, material);
  for (const x of wheels) well(g, { x, z: R, r: R + 3.5, y: cy + wellY });
  for (const x of wheels) wheel(g, { x, z: R, r: R, yOut: cy + tyreY, opening: opening(g, { x, z: R, r: R + 3.5, y: cy + wellY }) });
}

/* ---------- Sedan: low, with a distinct hood, cabin and trunk ---------- */
function sedan() {
  const L = 188; const W = 78; const cy = W / 2;
  const g = new Drawing([L / 2, cy, 30], 'sedan');
  const K = [
    { x: 0, z0: 20, a: 31, z1: 38, b: 33, z2: 44, c: 31, z3: 44, d: 31 },
    { x: 7, z0: 15, a: 36.5, z1: 40, b: 38.5, z2: 47, c: 36, z3: 47, d: 36 },
    { x: 34, z0: 14, a: 37.5, z1: 41, b: 39, z2: 48, c: 37, z3: 48, d: 37 },
    { x: 64, z0: 14, a: 37.5, z1: 41, b: 39, z2: 48, c: 37, z3: 73, d: 27 },
    { x: 104, z0: 14, a: 37.5, z1: 41, b: 39, z2: 48, c: 37, z3: 73, d: 27 },
    { x: 138, z0: 14, a: 37.5, z1: 41, b: 39, z2: 48, c: 37, z3: 48, d: 37 },
    { x: 176, z0: 16, a: 36.5, z1: 38, b: 38, z2: 43, c: 35, z3: 43, d: 35 },
    { x: 188, z0: 21, a: 31, z1: 33, b: 33, z2: 38, c: 30, z3: 38, d: 30 },
  ];
  const seams = [52, 87, 128];
  const st = withStations(K, [68, 85, 89, 100, ...seamStations(seams)]);
  carBody(g, { L, W, stations: st, R: 17, wheels: [44, 146], wellY: 38.6, tyreY: 37,
    material: bodyMaterial({ roofGlass: [[34, 64], [104, 138]], sideGlass: [[68, 85], [89, 100]], stripe: [7, 176], seams }) });
  nose(g, { F: 188.15, cy, half: 30, z: 21 });
  reflection(g, screen(K[4], K[5], cy));
  mirror(g, 134, cy + 37, 48);
  return g;
}

/* ---------- SUV / MPV: taller, higher off the ground, black cladding, roof rails ---------- */
function suv() {
  const L = 198; const W = 86; const cy = W / 2;
  const g = new Drawing([L / 2, cy, 40], 'suv');
  const K = [
    { x: 0, z0: 24, a: 37, z1: 50, b: 39, z2: 58, c: 37, z3: 92, d: 33 },
    { x: 6, z0: 20, a: 40.5, z1: 52, b: 42.5, z2: 60, c: 40.5, z3: 97, d: 35.5 },
    { x: 128, z0: 20, a: 40.5, z1: 52, b: 42.5, z2: 60, c: 40.5, z3: 97, d: 35.5 },
    { x: 152, z0: 20, a: 40.5, z1: 52, b: 42.5, z2: 60, c: 40.5, z3: 60, d: 40.5 },
    { x: 188, z0: 22, a: 40, z1: 51, b: 41.5, z2: 56, c: 39.5, z3: 56, d: 39.5 },
    { x: 198, z0: 27, a: 35, z1: 47, b: 36.5, z2: 52, c: 34.5, z3: 52, d: 34.5 },
  ];
  const seams = [50, 90];
  const st = withStations(K, [12, 44, 52, 86, 94, 124, ...seamStations(seams)]);
  carBody(g, { L, W, stations: st, R: 20, wheels: [46, 158], wellY: 42.4, tyreY: 41, material: bodyMaterial({
    roofGlass: [[128, 152]], sideGlass: [[12, 44], [52, 86], [94, 124]], stripe: [6, 188], seams, cladding: true }) });
  // roof rails on short legs
  for (const y of [cy - 27, cy + 27]) {
    box(g, [22, y - 1.6, 97], [120, y + 1.6, 100.5], 'trim', { bias: 700 });
    for (const x of [24, 116]) box(g, [x, y - 1.6, 96], [x + 4, y + 1.6, 98], 'trim', { bias: 690 });
  }
  nose(g, { F: 198.15, cy, half: 34, z: 27, grilleW: 16, grilleH: 7, lampW: 12, lampH: 5 });
  reflection(g, screen(K[2], K[3], cy));
  mirror(g, 146, cy + 41, 60);
  return g;
}

/* ---------- Van: tall vertical sides, a short hood, a sliding door ---------- */
function van() {
  const L = 212; const W = 88; const cy = W / 2;
  const g = new Drawing([L / 2, cy, 50], 'van');
  const K = [
    { x: 0, z0: 22, a: 40, z1: 56, b: 42, z2: 62, c: 41, z3: 109, d: 39 },
    { x: 4, z0: 18, a: 41.5, z1: 56, b: 43.5, z2: 62, c: 42.5, z3: 113, d: 40.5 },
    { x: 168, z0: 18, a: 41.5, z1: 56, b: 43.5, z2: 62, c: 42.5, z3: 113, d: 40.5 },
    { x: 188, z0: 18, a: 41.5, z1: 56, b: 43.5, z2: 63, c: 42.5, z3: 70, d: 41.5 },
    { x: 205, z0: 20, a: 40.5, z1: 54, b: 42, z2: 59, c: 40, z3: 59, d: 40 },
    { x: 212, z0: 25, a: 36, z1: 50, b: 37.5, z2: 55, c: 36, z3: 55, d: 36 },
  ];
  const seams = [96, 148];
  const st = withStations(K, [12, 58, 102, 142, 154, ...seamStations(seams)]);
  carBody(g, { L, W, stations: st, R: 20, wheels: [46, 172], wellY: 43.4, tyreY: 42, material: bodyMaterial({
    roofGlass: [[168, 188]], sideGlass: [[12, 58], [102, 142], [154, 188]], stripe: [4, 205], seams,
    seamBands: ['nearLow', 'nearShoulder', 'nearGlass', 'nearStripe'] }) });
  // the sliding door's rail
  onSide(g, cy + 42.6, [[96, 63], [212 - 64, 63], [212 - 64, 64.2], [96, 64.2]], '#3f1a6e', 650);
  nose(g, { F: 212.15, cy, half: 35, z: 26, grilleW: 15, grilleH: 7, lampW: 11, lampH: 5 });
  reflection(g, screen(K[2], K[3], cy));
  mirror(g, 184, cy + 42, 66);
  return g;
}

/* ---------- Truck: a cab, and a gold cargo box on a frame, twin rear wheels ---------- */
function truck() {
  const W = 92; const cy = W / 2; const L = 244;
  const g = new Drawing([L / 2, cy, 60], 'truck');
  ground(g, 4, L - 2, 2, W + 2);
  const R = 21;
  for (const x of [46, 92, 206]) wheel(g, { x, z: R, r: R, yOut: 14, far: true });
  // the frame and the cargo box
  box(g, [6, cy - 34, 30], [176, cy + 34, 44], 'trim');
  box(g, [0, 0, 44], [168, W, 152], 'gold');
  // the box's frame: darker gold edges, and a purple band (the brand, without decoration)
  onSide(g, W + 0.1, [[0, 44], [168, 44], [168, 48], [0, 48]], mix(MAT.gold.base, '#7a4a10', 0.35), 650);
  onSide(g, W + 0.1, [[0, 148], [168, 148], [168, 152], [0, 152]], mix(MAT.gold.base, '#7a4a10', 0.2), 650);
  for (const x of [0, 164]) onSide(g, W + 0.12, [[x, 44], [x + 4, 44], [x + 4, 152], [x, 152]], mix(MAT.gold.base, '#7a4a10', 0.28), 660);
  onSide(g, W + 0.11, [[4, 60], [164, 60], [164, 72], [4, 72]], lit('paint', [0, 1, 0]), 655);
  // mudguards over the twin rear wheels
  box(g, [20, cy + 30, 44], [118, cy + 46, 47], 'trim', { bias: 300 });
  // the cab
  const K = [
    { x: 172, z0: 20, a: 43, z1: 60, b: 45, z2: 66, c: 44, z3: 114, d: 41.5 },
    { x: 176, z0: 18, a: 43.5, z1: 60, b: 45.5, z2: 66, c: 44.5, z3: 116, d: 42.5 },
    { x: 224, z0: 18, a: 43.5, z1: 60, b: 45.5, z2: 66, c: 44.5, z3: 116, d: 42.5 },
    { x: 236, z0: 18, a: 43.5, z1: 60, b: 45.5, z2: 66, c: 44.5, z3: 74, d: 43 },
    { x: 240, z0: 18, a: 43, z1: 58, b: 44.5, z2: 64, c: 43.5, z3: 70, d: 42.5 },
    { x: 244, z0: 22, a: 40, z1: 54, b: 41.5, z2: 62, c: 40.5, z3: 66, d: 40 },
  ];
  const st = withStations(K, [184, 220, ...seamStations([180])]);
  const prev = g.center; g.center = [208, cy, 60];
  shell(g, st, cy, bodyMaterial({ roofGlass: [[224, 236]], sideGlass: [[184, 220]], stripe: [176, 240], seams: [180] }));
  well(g, { x: 206, z: R, r: R + 3.5, y: cy + 45 });
  g.center = prev;
  // near wheels: the twin rear ones under the box, the front one in its arch
  for (const x of [46, 92]) { wheel(g, { x, z: R, r: R, yOut: cy + 40, opening: g.clip([[x - R - 4, cy + 40, 44], [x + R + 4, cy + 40, 44], [x + R + 4, cy + 40, -8], [x - R - 4, cy + 40, -8]]) }); }
  wheel(g, { x: 206, z: R, r: R, yOut: cy + 44, opening: opening(g, { x: 206, z: R, r: R + 3.5, y: cy + 45 }) });
  nose(g, { F: 244.15, cy, half: 38, z: 24, grilleW: 20, grilleH: 12, lampW: 10, lampH: 6 });
  reflection(g, screen(K[2], K[3], cy));
  mirror(g, 232, cy + 44, 74);
  return g;
}

/* ---------- Motor: a scooter with a front shield, seat, handlebar and a delivery box ---------- */
// delivery: the gold box on the rack (Parcel, Food, Cargo); without it, a two-up seat and a grab rail (Ride)
function moto({ delivery = true } = {}) {
  const g = new Drawing([34, 0, 30], delivery ? 'moto' : 'motoride');
  const R = 12;
  ground(g, -2, 74, -10, 10);
  wheel(g, { x: 14, z: R, r: R, yOut: 4, w: 8, opening: g.clip([[0, 4, 26], [28, 4, 26], [28, 4, -6], [0, 4, -6]]) });
  // floorboard, rear body, seat
  box(g, [24, -7, 13], [50, 7, 17], 'trim', { bias: 200 });
  const cowl = [
    { x: 4, z0: 20, a: 4.5, z1: 30, b: 6.5, z2: 36, c: 5.5, z3: 37, d: 4 },
    { x: 10, z0: 15, a: 6.5, z1: 31, b: 8.2, z2: 38, c: 7, z3: 39.5, d: 5 },
    { x: 30, z0: 15, a: 6.5, z1: 31, b: 8.2, z2: 38, c: 7, z3: 39.5, d: 5 },
    { x: 36, z0: 18, a: 5.5, z1: 29, b: 7, z2: 33, c: 6, z3: 33, d: 5 },
  ];
  const prev = g.center; g.center = [20, 0, 28];
  shell(g, cowl, 0, (band) => ((band === 'nearStripe' || band === 'farStripe') ? 'gold' : 'paint'));
  g.center = prev;
  box(g, [9, -5.5, 39.5], [31, 5.5, 43.5], 'trim', { bias: 400 });
  if (delivery) {
    // the delivery box on its rack: gold, a purple band, a darker lid
    box(g, [-5, -12, 46], [23, 12, 70], 'gold', { bias: 500 });
    box(g, [-6, -13, 70], [24, 13, 73], mix(MAT.gold.base, '#7a4a10', 0.25), { bias: 520 });
    onSide(g, 12.1, [[-5, 54], [23, 54], [23, 59], [-5, 59]], lit('paint', [0, 1, 0]), 560);
    box(g, [2, -4, 43.5], [16, 4, 46], 'trim', { bias: 450 });
  } else {
    // a passenger's raised half of the seat, a grab rail round it, and a tail light
    box(g, [5, -5, 43.5], [17, 5, 46.5], 'trim', { bias: 420 });
    box(g, [2, -7.5, 44], [4, 7.5, 47], '#2c2240', { bias: 430 });
    for (const y of [-7.5, 5.5]) box(g, [2, y, 44], [16, y + 2, 46], '#2c2240', { bias: 435 });
    onFront(g, 3.6, 0, [[-3, 31], [3, 31], [3, 34], [-3, 34]], '#e0607e', 440);
  }
  // the front shield and the headlight
  const shield = [
    { x: 46, z0: 15, a: 6, z1: 40, b: 7, z2: 49, c: 6, z3: 51, d: 4.5 },
    { x: 56, z0: 15, a: 7, z1: 42, b: 8, z2: 53, c: 6.5, z3: 55, d: 5 },
    { x: 62, z0: 22, a: 5, z1: 40, b: 6, z2: 51, c: 5, z3: 53, d: 4 },
  ];
  g.center = [54, 0, 34];
  shell(g, shield, 0, () => 'paint');
  g.center = prev;
  onFront(g, 62.2, 0, [[-3.4, 43], [3.4, 43], [3.4, 48], [-3.4, 48]], '#3a2d52', 900);
  onFront(g, 62.3, 0, [[-2.4, 43.8], [2.4, 43.8], [2.4, 47.2], [-2.4, 47.2]], 'lamp', 901);
  // the front fork and wheel, then the handlebar on top
  box(g, [60, -1.5, 12], [63, 1.5, 30], 'trim', { bias: 950 });
  wheel(g, { x: 62, z: R, r: R, yOut: 4, w: 8, opening: g.clip([[48, 4, 22], [76, 4, 22], [76, 4, -6], [48, 4, -6]]) });
  box(g, [53, -16, 55], [57, 16, 58], 'trim', { bias: 1e4 + 100 });
  for (const y of [-16, 13]) box(g, [52, y, 54], [58, y + 3, 59], '#2c2240', { bias: 1e4 + 110 });
  return g;
}

/* ---------- Props: lavender-grey things people send ---------- */
MAT.prop = { base: '#e9e3f0', amb: 0.62, dif: 0.42, fill: 0.12, spec: 0.08, shine: 10 };
MAT.cushion = { base: '#f6f2fa', amb: 0.66, dif: 0.38, fill: 0.12, spec: 0.08, shine: 10 };
function parcels() {
  const g = new Drawing([30, 30, 20], 'parcels');
  ground(g, 0, 64, 0, 58);
  box(g, [0, 0, 0], [34, 30, 26], 'prop'); box(g, [34, 4, 0], [62, 32, 22], 'prop', { bias: 20 }); box(g, [4, 30, 0], [40, 58, 30], 'prop', { bias: 40 });
  box(g, [6, 4, 26], [30, 26, 46], 'prop', { bias: 60 }); box(g, [10, 34, 30], [36, 54, 46], 'prop', { bias: 80 });
  onSide(g, 58.1, [[4, 13.5], [40, 13.5], [40, 16.5], [4, 16.5]], '#d2c7e0', 200);
  return g;
}
function sofa() {
  const g = new Drawing([65, 28, 25], 'sofa');
  ground(g, 0, 130, 0, 56);
  box(g, [0, 0, 6], [130, 56, 26], 'prop');
  box(g, [0, 0, 26], [130, 16, 58], 'prop', { bias: 30 });
  box(g, [0, 16, 26], [16, 56, 44], 'prop', { bias: 40 }); box(g, [114, 16, 26], [130, 56, 44], 'prop', { bias: 120 });
  box(g, [18, 18, 26], [64, 54, 32], 'cushion', { bias: 60 }); box(g, [66, 18, 26], [112, 54, 32], 'cushion', { bias: 80 });
  for (const [x, y] of [[4, 4], [122, 4], [4, 48], [122, 48]]) box(g, [x, y, 0], [x + 4, y + 4, 6], '#cbbfdb', { bias: -10 });
  return g;
}
function bags() {
  const g = new Drawing([30, 18, 18], 'bags');
  ground(g, 0, 56, 0, 32);
  const bag = (x, y, h, b) => {
    box(g, [x, y, 0], [x + 26, y + 14, h], 'prop', { bias: b });
    const outer = Array.from({ length: 13 }, (_, i) => { const t = Math.PI * (i / 12); return [x + 13 + 8 * Math.cos(t), h + 9 * Math.sin(t)]; });
    const inner = Array.from({ length: 13 }, (_, i) => { const t = Math.PI * (1 - i / 12); return [x + 13 + 5.5 * Math.cos(t), h + 6.5 * Math.sin(t)]; });
    onSide(g, y + 14.05, [...outer, ...inner], '#cfc3de', b + 300);
  };
  bag(0, 0, 34, 0); bag(28, 16, 28, 200);
  return g;
}

/* ---------- The fleet: one scene, everything at one scale ---------- */
function fleet(made) {
  const props = { parcels: parcels(), sofa: sofa(), bags: bags() };
  // screen position of each one's origin, back to front; flip: facing the other way (mirrored)
  const layout = [
    [props.sofa, 560, 60, false], [made.truck, 40, 150, false], [made.van, 420, 262, false], [props.parcels, 740, 300, false],
    [made.suv, 300, 480, true], [made.moto, 850, 470, false], [made.car, 560, 560, false], [props.bags, 820, 660, false],
  ];
  const ext = []; let defs = ''; let body = '';
  for (const [d, px, py, flip] of layout) {
    const all = d.faces.flatMap((f) => f.pts.map(project));
    const xs = all.map((p) => (flip ? -p[0] : p[0]) + px); const ys = all.map((p) => p[1] + py);
    ext.push(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));
    defs += d.defs().replace(/^<defs>|<\/defs>$/g, '');
    body += `<g transform="translate(${px} ${py})${flip ? ' scale(-1 1)' : ''}">${d.paths()}</g>`;
  }
  const xs = ext.filter((_, i) => i % 4 < 2); const ys = ext.filter((_, i) => i % 4 >= 2);
  const pad = 24; const x0 = Math.min(...xs) - pad; const y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - x0 + pad; const h = Math.max(...ys) - y0 + pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"><defs>${defs}</defs>${body}</svg>`;
}

const out = new URL('../assets/images/iso/', import.meta.url);
mkdirSync(out, { recursive: true });
const made = { moto: moto(), car: sedan(), suv: suv(), van: van(), truck: truck() };
writeFileSync(new URL('moto-ride.svg', out), moto({ delivery: false }).svg()); // Ride's Motor: a passenger seat, no box
for (const [name, d] of Object.entries(made)) writeFileSync(new URL(`${name}.svg`, out), d.svg());
writeFileSync(new URL('fleet.svg', out), fleet(made));
console.log('written: iso/', Object.keys(made).join(', '), '+ fleet');
