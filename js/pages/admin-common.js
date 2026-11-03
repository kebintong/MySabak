/* Shared by the admin pages (pages/admin*.html). Admins sign in on the customer form (pages/account.html);
   nothing on the site links to these pages. */
import { mountChrome } from '../ui.js';

/** Mount the page for admins only: signed-out visitors go to sign in, other roles to their own home. */
export function mountAdmin() {
  return mountChrome({ roles: ['admin'] }).then((user) => {
    if (user && user.role !== 'admin') return null; // being sent to their own home
    if (!user) { location.replace('/pages/account.html'); return null; }
    return user;
  });
}

export const VEHICLE = { motor: 'Motor', sedan: 'Sedan', suv: 'SUV' };
export const VEHICLE_ART = { motor: '/assets/images/3d/moto.webp', sedan: '/assets/images/3d/car.webp', suv: '/assets/images/3d/car.webp' };
// Trip services, in a fixed order with the validated chart colours (Express needs its labels: low contrast on white)
export const SERVICES = [
  { id: 'ride', name: 'Ride', color: '#7b3fbf' },
  { id: 'express', name: 'Express', color: '#e3933f' },
  { id: 'moto', name: 'Moto', color: '#2f80d1' },
  { id: 'shop', name: 'Shop', color: '#1e8a4c' },
];
export const STATUS = {
  review: { label: 'Waiting', icon: '…' },
  fix: { label: 'Needs a fix', icon: '!' },
  approved: { label: 'Approved', icon: '✓' },
  rejected: { label: 'Rejected', icon: '✕' },
};
export const minSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const num = (n) => Number(n).toLocaleString('en-PH');
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
/** How long ago, roughly: "6 h", "2 d". */
export const ago = (ts) => {
  const h = Math.max(0, Math.round((Date.now() - ts) / 3600e3));
  return h < 1 ? 'just now' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
};
