/**
 * The plugin's screen is an application of the `@toghen/ui` design system: its
 * stylesheet adjusts the system's components and lays out the application, and
 * reads nothing but the system's tokens; its markup is spelled the way the
 * system spells its components.
 *
 * The screen has no test runner of its own (the preview page is how it is
 * looked at), so what can be checked without a browser is checked here: the
 * stylesheet, read as text, and the sources, read as text.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ui = (path: string) => fileURLToPath(new URL(`../ui/${path}`, import.meta.url));

/** The design system's stylesheet, as the build writes it, without its fonts. */
let system = '';
/** The names of the custom properties the design system declares. */
let declared = new Set<string>();
let screen: postcss.Root;

before(async () => {
  // The stylesheet @toghen/ui ships, as its build wrote it.
  system = readFileSync(fileURLToPath(import.meta.resolve('@toghen/ui/styles.css')), 'utf8').replace(/url\(data:[^)]+\)/g, 'url(DATA)');
  declared = new Set([...system.matchAll(/(--tg-[a-z0-9-]+):/g)].map((match) => match[1]));
  screen = postcss.parse(readFileSync(ui('styles.css'), 'utf8'));
});

test('structured values come out of the design system as CSS', () => {
  assert.doesNotMatch(system, /\[object Object\]|toghen\(|@toghen|undefined/);
  // A colour with alpha, a dimension, a number, a font list, and a two-layer shadow.
  assert.match(system, /--tg-bg-selected: #0c8ce91a;/);
  assert.match(system, /--tg-h-row: 28px;/);
  assert.match(system, /--tg-lh-tight: 1\.2;/);
  assert.match(system, /--tg-font-code: "Geist Mono", ui-monospace, Menlo, monospace;/);
  assert.match(system, /--tg-shadow-pop: 0px 4px 16px 0px #00000024, 0px 0px 0px 1px #0000000f\b/);
});

test('every token the stylesheet reads is one the design system declares', () => {
  const read = new Set<string>();
  screen.walkDecls((decl) => {
    for (const match of decl.value.matchAll(/var\((--[a-z0-9-]+)/g)) read.add(match[1]);
  });
  assert.ok(read.size > 50, `${read.size} tokens read`);
  for (const name of read) {
    // `--results-height` is the one property of the application's own: the splitter writes it inline.
    if (name === '--results-height') continue;
    assert.ok(declared.has(name), `${name} is read by ui/styles.css and declared by no one`);
  }
});

test('the stylesheet holds no colour of its own and declares only design-system tokens', () => {
  screen.walkDecls((decl) => {
    assert.doesNotMatch(decl.value, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/i, `${decl.prop}: ${decl.value}`);
    // A component's own token may be set for one place (the drift count is a link in the colour of drift); a new name may not.
    if (decl.prop.startsWith('--') && decl.prop !== '--results-height')
      assert.ok(declared.has(decl.prop), `${decl.prop} is declared by ui/styles.css and by no component`);
  });
});

test('the stylesheet is unlayered, so that it comes after the design system and wins', () => {
  screen.walkAtRules('layer', (rule) => assert.fail(`@layer ${rule.params} in ui/styles.css`));
  assert.match(readFileSync(new URL('../build.mjs', import.meta.url), 'utf8'), /designSystemCss\(\)[\s\S]*ui\/styles\.css/);
});

/** The sources of the screen: everything under `ui/` except the preview's own fixtures. */
function sources(dir = ui('')): { file: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'dev' ? [] : sources(`${path}/`);
    return /\.(js|html)$/.test(entry.name) ? [{ file: path.slice(ui('').length), text: readFileSync(path, 'utf8') }] : [];
  });
}

/** What the screen used to spell, and what it spells now. */
const RETIRED: [RegExp, string][] = [
  [/class="(?:[^"]* )?btn[ "]/, 'a button is `class="tg-button"` with data-variant, data-size, data-shape'],
  [/class="(?:[^"]* )?(?:icon-btn|link)[ "]/, 'an icon button and a link are button variants'],
  [
    /class="(?:[^"]* )?(?:field|search|select|check|chip-check)[ "]/,
    'a field, select and checkbox are `tg-field`, `tg-select`, `tg-checkbox`',
  ],
  [
    /class="(?:[^"]* )?(?:drop|add-chip|segmented|swatch|monogram|divider|item|prop|recent-load|tpl-line|source-row|command-row|ctable)[ "]/,
    "a dropzone, segmented control, swatch, monogram, divider, row or table is the design system's",
  ],
  [/(?<![-\w])(?:tone|size|state|mono)="/, 'a variant is a data-* attribute'],
  [/\bglyph\(|<tg-glyph|\bicon\('[^']+', \d/, 'an icon is a Phosphor icon, drawn by `icon()` from markup.js'],
  [/classList\.(?:add|remove|toggle)\('(?:over|selected|open)'/, 'a state is an ARIA attribute, or data-over, never a class'],
  [/class="[^"]*\b(?:selected|open)\b/, 'selected is aria-selected and open is aria-expanded'],
  [/class="[^"]*\bprimary\b/, 'primary is data-variant="primary", and a button that cannot be pressed is disabled, not demoted'],
  [
    /<tg-row[^>]*\s(?:role|tabindex)=/,
    'a row takes no role or tab stop from the screen: a `tg-list` makes its rows options, and a row with a detail is a disclosure whose summary button the element provides',
  ],
];

test('the screen is spelled as the design system spells its components', () => {
  for (const { file, text } of sources()) {
    for (const [pattern, say] of RETIRED) {
      const found = text.match(pattern);
      assert.ok(!found, `${file}: ${found?.[0]} (${say})`);
    }
  }
});

test('the screen defines no element the design system already defines', () => {
  const defined = [...system.matchAll(/(?:^|[\s,}])(tg-[a-z]+)(?=[\s,{[>:.])/g)].map((match) => match[1]);
  const own = sources().flatMap(({ file, text }) =>
    [...text.matchAll(/define\('(tg-[a-z-]+)'/g)].map((match) => ({ file, name: match[1] })),
  );
  assert.ok(own.length >= 7, "the panes, the results, the status bar and the popover are the screen's own");
  for (const { file, name } of own) {
    assert.ok(
      !['tg-dot', 'tg-chip', 'tg-callout', 'tg-card', 'tg-tabs', 'tg-segmented', 'tg-row', 'tg-list'].includes(name),
      `${file} defines ${name}, which @toghen/ui defines`,
    );
  }
  assert.ok(
    defined.includes('tg-row') && defined.includes('tg-tabs') && defined.includes('tg-list'),
    'the design system styles the elements it defines',
  );
});

test("the browser's columns are lists of options, and the rows that open hold their own detail", () => {
  const tokens = readFileSync(ui('components/pane-tokens.js'), 'utf8');
  // A column, and the "also in" list, are listboxes named for what they hold; the screen listens for what they say.
  assert.equal([...tokens.matchAll(/<tg-list aria-label=/g)].length, 2);
  assert.match(tokens, /addEventListener\('tg-change'[\s\S]*addEventListener\('tg-activate'/);
  // The open token is the selected option, and its in-place detail is a part of its row.
  assert.match(tokens, /data-open-token="\$\{escAttr\(token\.path\)\}"\$\{open \? ' aria-selected="true"' : ''\}/);
  assert.match(tokens, /<div data-part="detail" class="detail in-place">/);

  const templates = readFileSync(ui('components/pane-build.js'), 'utf8');
  assert.match(templates, /<div data-part="detail" class="tpl-detail">/);
  assert.match(templates, /addEventListener\('tg-toggle'/);

  // A recent loads from the row's own summary button, and Forget is in the row's trailing part, outside it.
  const load = readFileSync(ui('components/pane-load.js'), 'utf8');
  assert.match(
    load,
    /<button type="button" data-part="summary" data-action="load-recent"[\s\S]*<span data-part="trailing"><button[^>]*data-action="forget"/,
  );
});

test('the stylesheet keeps none of the workarounds the design system now covers', () => {
  const text = readFileSync(ui('styles.css'), 'utf8');
  // Rows in a card are flush by the card; a detail and a Forget are in their row; an open row carries its gutter on its own.
  assert.doesNotMatch(text, /tg-card tg-row\s*\{/);
  assert.doesNotMatch(text, /\.recent\b[^-]/);
  assert.doesNotMatch(text, /aria-expanded='true'\]\s*\+/);
  assert.doesNotMatch(text, /\.detail\.in-place,\s*\.tpl-detail\s*\{[^}]*border-left/);
  assert.doesNotMatch(text, /position:\s*absolute;[^}]*inset-inline-end/);
});
