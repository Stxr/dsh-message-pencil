import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
await import('../build.js');
await import('./native-config.js');
const child = spawn(process.execPath, ['--import', 'tsx/esm', '--test', 'tests/edit.test.js', 'tests/client-registration.test.js', 'tests/native.test.js', 'tests/visibility-lifecycle.test.js'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit',
  env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL('./.native-tsconfig.json', import.meta.url)) },
});
process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
