const { spawn } = require('node:child_process');
const { delimiter, join } = require('node:path');

const cargoBin = join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
const tauriCli = require.resolve('@tauri-apps/cli/tauri.js');
const env = {
  ...process.env,
  PATH: [cargoBin, process.env.PATH].filter(Boolean).join(delimiter),
};

const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not start Tauri CLI: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
