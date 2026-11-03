/* =========================================================
   mysabak · driver navigation helpers
   Where the driver is along a route, and the next turn to show (driver home, in-app navigation).
   ========================================================= */
import { haversineKm } from './money.js';

/**
 * How far along `coords` ([lng, lat] pairs) the point `me` is, by its nearest spot on the line.
 * @returns {{alongM:number, offM:number, totalM:number}}  metres travelled, metres away from the line, route length
 */
export function routeProgress(coords, me) {
  const kx = Math.cos((me.lat * Math.PI) / 180) * 111320; // metres per degree here (flat is fine at city scale)
  const ky = 110540;
  let along = 0;
  let best = { d: Infinity, along: 0 };
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [aLng, aLat] = coords[i];
    const [bLng, bLat] = coords[i + 1];
    const seg = haversineKm({ lng: aLng, lat: aLat }, { lng: bLng, lat: bLat }) * 1000;
    const ax = (aLng - me.lng) * kx; const ay = (aLat - me.lat) * ky;
    const dx = (bLng - aLng) * kx; const dy = (bLat - aLat) * ky;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best.d) best = { d, along: along + t * seg };
    along += seg;
  }
  return { alongM: best.along, offM: best.d === Infinity ? 0 : best.d, totalM: along };
}

/**
 * The next step more than 10 m ahead of `alongM`, the one after it, and how far away it is.
 * @param {Array<{atM:number}>} steps  from routeBetween(…, { steps: true })
 * @returns {{step:object, after:object|null, inM:number}|null}  null once past the last step
 */
export function nextStep(steps, alongM) {
  const i = steps.findIndex((s) => s.atM > alongM + 10);
  if (i < 0) return null;
  return { step: steps[i], after: steps[i + 1] || null, inM: steps[i].atM - alongM };
}
