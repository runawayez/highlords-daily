import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(here, 'core');
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });
for (const name of ['src', 'config', 'presets', 'public', 'plugins']) {
  await fs.cp(path.join(root, name), path.join(target, name), { recursive: true });
}
await fs.copyFile(path.join(root, 'package.json'), path.join(target, 'package.json'));
console.log(`Core prepared at ${target}`);
