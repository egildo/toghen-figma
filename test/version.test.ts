/** The version every fingerprint holds is this package's: a release that writes differently reads everything once. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../shared/version.js';

describe('the version a fingerprint holds', () => {
  it("is package.json's", () => {
    assert.equal(VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  });
});
