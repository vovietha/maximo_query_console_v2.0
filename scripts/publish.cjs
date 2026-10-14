const { execFileSync } = require('node:child_process');
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const repoUrl = process.argv[2];

function git(...args) {
  return execFileSync('git', args, { cwd: root, stdio: 'inherit' });
}

if (!repoUrl || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(repoUrl)) {
  console.error('Cách dùng: npm run publish -- https://github.com/OWNER/REPO.git');
  process.exit(1);
}

if (!existsSync(resolve(root, '.git'))) git('init', '--initial-branch=main');
const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
const remoteUrl = remote.status === 0 ? remote.stdout.trim() : '';
const normalizeUrl = (value) => value.replace(/\.git$/, '').replace(/\/$/, '');
if (remoteUrl && normalizeUrl(remoteUrl) !== normalizeUrl(repoUrl)) {
  console.error(`Remote origin hiện tại là ${remoteUrl}; không tự ý thay đổi.`);
  process.exit(1);
}
if (!remoteUrl) git('remote', 'add', 'origin', repoUrl);
git('branch', '-M', 'main');
git('add', '-A');
const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root, stdio: 'ignore' }).status !== 0;
if (staged) git('commit', '-m', 'chore: publish application source');
git('push', '--set-upstream', 'origin', 'main');
