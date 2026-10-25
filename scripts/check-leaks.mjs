// Fails when the built plugin in dist/ carries a leak: "[object Object]" in any file
// (an object stringified by mistake), or an unresolved `toghen(` directive in a CSS or
// HTML file (the stylesheet is resolved by @toghen/postcss; code.js may name `toghen(`
// in a comment). Run it after the build. An optional argument names another directory.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(dist)) {
  console.error(`leaks: ${dist} is missing; build the plugin first.`);
  process.exit(1);
}
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const all = files(dist);
const missing = ['code.js', 'ui.html'].filter((name) => !existsSync(join(dist, name)));
if (missing.length > 0 || !all.some((path) => ['.css', '.html'].includes(extname(path)))) {
  console.error(`leaks: ${dist} is incomplete (missing ${missing.join(', ') || 'any CSS or HTML file'}); build the plugin first.`);
  process.exit(1);
}
const hits = [];
for (const path of all) {
  const styled = ['.css', '.html'].includes(extname(path));
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (line.includes('[object Object]')) hits.push(`${path}:${index + 1}: "[object Object]"`);
      if (styled && line.includes('toghen(')) hits.push(`${path}:${index + 1}: unresolved "toghen("`);
    });
}
if (hits.length > 0) {
  console.error(`leaks: ${hits.length} found in ${dist}\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`leaks: none in ${dist}`);
