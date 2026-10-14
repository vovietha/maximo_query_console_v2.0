import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = resolve(root, 'node_modules');
const vendor = resolve(root, 'public/vendor');
await rm(vendor, { recursive: true, force: true });
await mkdir(vendor, { recursive: true });
const codeMirrorFiles = [
  'lib/codemirror.js', 'lib/codemirror.css',
  'mode/sql/sql.js',
  'addon/hint/show-hint.js', 'addon/hint/show-hint.css', 'addon/hint/sql-hint.js',
  'addon/comment/comment.js',
  'theme/dracula.css', 'theme/eclipse.css'
];
for (const file of codeMirrorFiles) {
  const destination = resolve(vendor, 'codemirror', file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(modules, 'codemirror', file), destination);
}
await mkdir(resolve(vendor, 'xlsx'), { recursive: true });
await cp(resolve(modules, 'xlsx/dist/xlsx.full.min.js'), resolve(vendor, 'xlsx/xlsx.full.min.js'));
const licenses = [
  `CodeMirror 5\n${await readFile(resolve(modules, 'codemirror/LICENSE'), 'utf8')}`,
  `\n\nSheetJS Community Edition\n${await readFile(resolve(modules, 'xlsx/LICENSE'), 'utf8')}`
].join('');
await writeFile(resolve(vendor, 'THIRD-PARTY-LICENSES.txt'), licenses);
