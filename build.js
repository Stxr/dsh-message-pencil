import { readFile, writeFile } from 'node:fs/promises';

const client = new URL('./client.js', import.meta.url);
const source = await readFile(new URL('./visibility.js', import.meta.url), 'utf8');
if (/^import\s/m.test(source)) throw new Error('The browser visibility module must be self-contained.');
const runtime = source.replace(/^export /gm, '');
const existing = await readFile(client, 'utf8');
const pattern = /\/\/ <message-pencil-visibility>[\s\S]*?\/\/ <\/message-pencil-visibility>/;
if (!pattern.test(existing)) throw new Error('Missing visibility build region.');
const output = existing.replace(pattern, '// <message-pencil-visibility>\n' + runtime + '// </message-pencil-visibility>');
if (output !== existing) await writeFile(client, output);
console.log('Built the self-contained browser visibility module.');
