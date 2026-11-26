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
  // The directory the command runs in: a script's, after any `cd` it makes. A script that wants where the person typed
  // it passes that itself, as this package's own `toghen-figma` script does.
  cwd: process.cwd(),
  readFile: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      // Node's reason ends with the path, made absolute (`ENOENT: no such file or directory, open '<path>'`); every
      // message that says a file cannot be read names it already, as typed.
      const reason = error.message.replace(/, open '.*'$/s, '');
      throw reason === error.message ? error : new Error(reason);
    }
  },
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  pairingFile: join(homedir(), '.toghen', 'figma-pairing'),
});
