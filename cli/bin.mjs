#!/usr/bin/env node
// The `toghen-figma` command. It always runs `main`: comparing this file with
// `process.argv[1]` breaks when the package is reached through a symlink.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { main } = await import('./main.ts');

process.exitCode = await main(process.argv.slice(2), {
  // pnpm runs a package script in the package's own directory; INIT_CWD is where the person typed it.
  cwd: process.env.INIT_CWD ?? process.cwd(),
  readFile: (path) => readFileSync(path, 'utf8'),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  pairingFile: join(homedir(), '.toghen', 'figma-pairing'),
});
