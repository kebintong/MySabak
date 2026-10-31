// Copies the website into dist/ (Wrangler runs this before `dev` and `deploy`; see wrangler.jsonc).
// Only what's listed here is published, so tests, docs, dev/ and .dev.vars stay private.
import { cpSync, rmSync } from 'node:fs';

const SITE = ['index.html', 'manifest.webmanifest', 'sw.js', 'pages', 'assets', 'css', 'js'];
rmSync('dist', { recursive: true, force: true });
SITE.forEach((path) => cpSync(path, `dist/${path}`, { recursive: true }));
