import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeNativeTestConfig } from './native-config';

// 回归直接运行本次新编译的入口，避免 TS 源通过但发行包失效。
await import('./build');
const config = await writeNativeTestConfig();
const root = fileURLToPath(new URL('..', import.meta.url));
const files = (await readdir(new URL('../tests', import.meta.url)))
  .filter(name => name.endsWith('.test.js')).sort().map(name => `tests/${name}`);
const child = spawn(process.execPath, ['--import', 'tsx/esm', '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TSX_TSCONFIG_PATH: config },
});
process.exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
