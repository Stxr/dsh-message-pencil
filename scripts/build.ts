import { build } from 'esbuild';
import type { BuildOptions } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLUGIN_NAME } from '../src/shared/protocol';

const root = fileURLToPath(new URL('..', import.meta.url));
const generated = '// Generated from TypeScript by pnpm build. Edit src/, not this file.';
const common: BuildOptions = {
  absWorkingDir: root,
  bundle: true,
  charset: 'utf8',
  minify: false,
  legalComments: 'inline',
  logLevel: 'info',
};

// TypeScript 是唯一维护入口，编译到 lib/ 后供 Git、本地目录和发行包安装使用。
await build({
  ...common,
  entryPoints: { index: 'src/host/index.ts', core: 'src/host/core.ts', visibility: 'src/client/history/index.ts' },
  outdir: 'lib',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['react'],
  banner: { js: generated },
});

// DSH 自己提供 React。把 CommonJS 模块放进宿主 factory，require 由 ModuleLoader 传入。
// 不打入第二份 React，也不让浏览器入口依赖 npm 或 ESM import。
await build({
  ...common,
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  platform: 'browser',
  format: 'cjs',
  target: 'es2023',
  external: ['react'],
  loader: { '.css': 'text' },
  banner: { js: `${generated}\nwindow.__ModuleLoader__.load({\n  id: ${JSON.stringify(PLUGIN_NAME)},\n  factory(require) {\n    const module = { exports: {} };` },
  footer: { js: '    return module.exports;\n  }\n});' },
});

// 发布类型声明，调用方无需引用开发目录或安装 DSH 参考源码。
execFileSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
  '-p', 'tsconfig.build.json',
], { cwd: root, stdio: 'inherit' });
