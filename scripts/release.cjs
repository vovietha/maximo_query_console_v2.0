const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const requested = process.argv[2];

function git(...args) {
  return execFileSync('git', args, { cwd: root, stdio: 'inherit' });
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

const configPath = 'src-tauri/tauri.conf.json';
const config = readJson(configPath);
const current = config.version;
let next;
if (/^(major|minor|patch)$/.test(requested || '')) {
  const [major, minor, patch] = current.split('.').map(Number);
  next = requested === 'major' ? `${major + 1}.0.0`
    : requested === 'minor' ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
} else if (/^\d+\.\d+\.\d+$/.test(requested || '')) {
  next = requested;
} else {
  console.error(`Cách dùng: npm run release -- patch | minor | major | 2.1.0 (hiện tại ${current})`);
  process.exit(1);
}

try {
  execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, stdio: 'ignore' });
} catch {
  console.error('Chưa có remote origin. Hãy chạy npm run publish -- https://github.com/OWNER/REPO.git trước.');
  process.exit(1);
}

config.version = next;
writeFileSync(resolve(root, configPath), `${JSON.stringify(config, null, 2)}\n`);

const packagePath = resolve(root, 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
packageJson.version = next;
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const npmLockPath = resolve(root, 'package-lock.json');
const npmLock = JSON.parse(readFileSync(npmLockPath, 'utf8'));
npmLock.version = next;
if (npmLock.packages?.['']) npmLock.packages[''].version = next;
writeFileSync(npmLockPath, `${JSON.stringify(npmLock, null, 2)}\n`);

const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
const cargoToml = readFileSync(cargoPath, 'utf8').replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${next}"`);
writeFileSync(cargoPath, cargoToml);

const cargoLockPath = resolve(root, 'src-tauri/Cargo.lock');
const cargoLock = readFileSync(cargoLockPath, 'utf8').replace(
  /(name = "maximo-query"\r?\nversion = ")[^"]+("\r?\n)/,
  `$1${next}$2`,
);
writeFileSync(cargoLockPath, cargoLock);

git('add', '-A');
git('commit', '-m', `release: v${next}`);
git('tag', `v${next}`);
git('push', 'origin', 'main', '--follow-tags');
console.log(`Đã đẩy v${next}. GitHub Actions sẽ build installer và tạo GitHub Release.`);
