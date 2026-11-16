import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../android/', import.meta.url));
const windows = process.platform === 'win32';
const command = windows ? process.env.ComSpec || 'cmd.exe' : 'sh';
const args = windows
  ? ['/d', '/c', 'gradlew.bat', 'assembleDebug']
  : ['./gradlew', 'assembleDebug'];
const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
