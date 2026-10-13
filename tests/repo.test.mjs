// Guards for the repo itself: no keys committed, no private files published. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = () => execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);

test('no API keys in the committed code', () => {
  const keyLike = /(tomtomKey|geoapifyKey)\s*:\s*['"][A-Za-z0-9]{16,}|TOMTOM_KEY\s*=\s*['"]?[A-Za-z0-9]{16,}|[?&]key=[A-Za-z0-9]{24,}/;
  const offenders = tracked()
    .filter((f) => /\.(js|mjs|json|jsonc|html|py|toml|txt|yml|yaml)$|^\.dev\.vars/.test(f) && f !== 'package-lock.json')
    .filter((f) => keyLike.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, [], 'Move keys to a Cloudflare secret (see DEPLOY.md)');
});

test('local secret files are not committed', () => {
  const secrets = tracked().filter((f) => /(^|\/)(\.dev\.vars|\.env)(\..*)?$/.test(f) && !f.endsWith('.example'));
  assert.deepEqual(secrets, []);
});

test('private files stay off the website (.assetsignore)', () => {
  const ignored = readFileSync('.assetsignore', 'utf8').split('\n').map((l) => l.trim());
  const mustHide = ['.git', '.github', 'node_modules', 'worker', 'wrangler.jsonc', '.dev.vars*', '.env*',
    'serve.py', 'package.json', 'package-lock.json', 'tests', 'dist'];
  assert.deepEqual(mustHide.filter((p) => !ignored.includes(p)), []);
});
