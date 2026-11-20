import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ReferenceConfig {
  compilerOptions: { paths: Record<string, string[]> };
}

/** 原生回归需要固定版本的相邻 DSH 源码；开发构建和运行插件均不需要它。 */
export async function writeNativeTestConfig() {
  const project = fileURLToPath(new URL('..', import.meta.url));
  const reference = fileURLToPath(new URL('../../deepseek-harness-rc5', import.meta.url));
  const source = await readFile(resolve(reference, 'tsconfig.base.json'), 'utf8');
  const config = JSON.parse(source.replace(/^\s*\/\/.*$/gm, '')) as ReferenceConfig;
  const paths = Object.fromEntries(Object.entries(config.compilerOptions.paths)
    .map(([name, values]) => [name, values.map(value => resolve(reference, value))]));

  for (const name of ['vanilla', 'middleware', 'shallow']) {
    paths[`zustand/${name}`] = [resolve(project, `node_modules/zustand/${name}.js`)];
  }
  paths.immer = [resolve(project, 'node_modules/immer/dist/immer.mjs')];

  const output = resolve(project, 'tests/.native-tsconfig.json');
  await writeFile(output, JSON.stringify({ compilerOptions: { paths } }, null, 2) + '\n');
  return output;
}
