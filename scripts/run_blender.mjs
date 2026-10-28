import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const windowsDefault = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const command = process.env.BLENDER_PATH || (existsSync(windowsDefault) ? windowsDefault : 'blender');
const child = spawn(command, ['--background', '--factory-startup', '--python-exit-code', '1',
  '--python', resolve(root, 'scripts/generate_blockout.py'), '--', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', shell: false, windowsHide: true,
});
child.on('error', (error) => {
  process.stderr.write(`Blender 5.2.1 is required. Set BLENDER_PATH to its executable. ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
