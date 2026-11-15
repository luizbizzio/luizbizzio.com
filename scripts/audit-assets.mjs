// Prevent identical local image/icon files from accumulating under different names.
import {createHash} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const roots = ['previews', 'icons', 'assets/icons'];
const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif']);
const byHash = new Map();
let checked = 0;

async function scan(dir) {
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scan(full);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      const hash = createHash('sha256').update(await fs.readFile(full)).digest('hex');
      const relative = path.relative(publicDir, full).replaceAll(path.sep, '/');
      const files = byHash.get(hash) || [];
      files.push(relative);
      byHash.set(hash, files);
      checked++;
    }
  }
}
for (const dir of roots) await scan(path.join(publicDir, dir));
const duplicates = [...byHash.values()].filter(files => files.length > 1);
if (duplicates.length) {
  console.error('Duplicate image files with identical content:');
  for (const group of duplicates) console.error('  ' + group.join(' = '));
  process.exitCode = 1;
} else {
  console.log('Asset audit passed: ' + checked + ' images/icons, no identical copies.');
}
