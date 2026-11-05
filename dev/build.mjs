// Copies the website into dist/ (Wrangler runs this before `dev` and `deploy`; see wrangler.jsonc).
// Only what's listed here is published, so tests, docs, dev/ and .dev.vars stay private.
import { cpSync, rmSync, readdirSync, mkdirSync } from 'node:fs';

const SITE = ['index.html', 'manifest.webmanifest', 'sw.js', 'pages', 'assets', 'css', 'js'];
// Empty dist/ rather than delete it: on Windows the running `wrangler dev` holds the folder open (EPERM)
mkdirSync('dist', { recursive: true });
readdirSync('dist').forEach((f) => rmSync(`dist/${f}`, { recursive: true, force: true }));
SITE.forEach((path) => cpSync(path, `dist/${path}`, { recursive: true }));
