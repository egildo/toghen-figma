/**
 * `toghen-figma check`: the component files read against the design system, with no plugin and no Figma file.
 *
 * No socket is opened and no Figma mock is installed: the command builds the resolver in Node and runs the plugin's own
 * check on it. Synthetic tokens in the W3C structured shapes; the files are given to the command by a fake `readFile`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main, type Io } from '../cli/main.js';
import { checkComponentFiles } from '../main/components/file.js';
import { Resolver, type ResolverDocument } from '@toghen/lib';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Tokens',
  sets: {
    base: {
      sources: [
        {
          $extensions: {
            'com.toghen': { css: { parts: { variant: { solid: "[data-variant='solid']", outline: "[data-variant='outline']" } } } },
          },
          space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } } },
          surface: { page: { $type: 'color', $value: srgb(0.96, 0.97, 1) } },
          avatar: {
            backgroundColor: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) },
            solid: { backgroundColor: { $type: 'color', $value: srgb(0, 0, 1) } },
            outline: { backgroundColor: { $type: 'color', $value: srgb(1, 1, 1) } },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

// Line 2 names `{space.xl}` when asked, which the document does not have.
const panel = (spacing: string) => `component Panel
FRAME Panel layoutMode=VERTICAL itemSpacing="${spacing}" {
    fills "{surface.page}"
}
`;
const avatar = `component Avatar tokens="{avatar}" layout=parts
properties {
    VARIANT variant soft solid
}
FRAME Avatar layoutMode=HORIZONTAL
`;

async function check(argv: string[], files: Record<string, string>) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: '/repo',
    readFile: (path) => {
      if (!(path in files)) throw new Error(`no such file ${path}`);
      return files[path];
    },
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: '/nowhere/pairing',
  };
  const code = await main(['check', ...argv], io);
  return { code, stdout, stderr };
}

const FILES = { '/repo/tokens.resolver.json': JSON.stringify(DOCUMENT) };

describe('toghen-figma check', () => {
  it('exits 0 and says so when every file reads and every name is in the design system', async () => {
    const out = await check(['tokens.resolver.json', 'ui/panel.component.kdl'], {
      ...FILES,
      '/repo/ui/panel.component.kdl': panel('{space.sm}'),
    });
    assert.equal(out.code, 0);
    assert.equal(out.stderr, '');
    assert.equal(out.stdout, '1 file read: no errors\n');
  });

  it('prints a problem as <file>:<line>:<column> <message> and exits 1, for a name the design system does not define', async () => {
    const out = await check(['tokens.resolver.json', 'ui/panel.component.kdl'], {
      ...FILES,
      '/repo/ui/panel.component.kdl': panel('{space.xl}'),
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /^ui\/panel\.component\.kdl:2:\d+ token \{space\.xl\} is not in the design system "[^"]+"$/m);
    assert.match(out.stdout, /^1 file read: 1 error\n$/);
  });

  it('says every problem of every file, not the first', async () => {
    const out = await check(['tokens.resolver.json', 'a.component.kdl', 'b.component.kdl'], {
      ...FILES,
      '/repo/a.component.kdl': panel('{space.xl}'),
      '/repo/b.component.kdl': panel('{space.xxl}'),
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /^a\.component\.kdl:2:\d+ token \{space\.xl\}/m);
    assert.match(out.stderr, /^b\.component\.kdl:2:\d+ token \{space\.xxl\}/m);
  });

  it('prints a warning with its place and still exits 0 when no file has an error', async () => {
    const out = await check(['tokens.resolver.json', 'ui/avatar.component.kdl'], { ...FILES, '/repo/ui/avatar.component.kdl': avatar });
    assert.equal(out.code, 0);
    assert.match(
      out.stderr,
      /^ui\/avatar\.component\.kdl:1:1 warning: VARIANT "variant" is declared and also comes from the parts of "avatar"; the declared values win, and "outline" is left out\.$/m,
    );
    assert.equal(out.stdout, '1 file read: no errors, 1 warning\n');
  });

  it('reads a file that does not parse, with its place, and exits 1', async () => {
    const out = await check(['tokens.resolver.json', 'ui/broken.component.kdl'], {
      ...FILES,
      '/repo/ui/broken.component.kdl': 'component Broken {\n',
    });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /^ui\/broken\.component\.kdl/m);
  });

  it('refuses a resolver document that cannot be read, a file that cannot be read, and a missing argument', async () => {
    const noResolver = await check(['missing.resolver.json', 'ui/panel.component.kdl'], {
      '/repo/ui/panel.component.kdl': panel('{space.sm}'),
    });
    assert.equal(noResolver.code, 1);
    assert.match(noResolver.stderr, /^missing\.resolver\.json:/);
    const noFile = await check(['tokens.resolver.json', 'ui/gone.component.kdl'], FILES);
    assert.equal(noFile.code, 1);
    assert.match(noFile.stderr, /^ui\/gone\.component\.kdl cannot be read/);
    const nothing = await check(['tokens.resolver.json'], FILES);
    assert.equal(nothing.code, 1);
    assert.match(nothing.stderr, /^no component file given/);
    assert.equal((await check(['--dry-run', 'tokens.resolver.json', 'x.component.kdl'], FILES)).code, 1);
  });

  it('opens no socket and installs no Figma: it needs neither a plugin nor a Figma global', async () => {
    assert.equal((globalThis as { figma?: unknown }).figma, undefined);
    const out = await check(['tokens.resolver.json', 'ui/panel.component.kdl'], {
      ...FILES,
      '/repo/ui/panel.component.kdl': panel('{space.sm}'),
    });
    assert.equal(out.code, 0);
  });

  it('takes token files in order as the entry, named by --name, as the plugin loads them', async () => {
    const files = {
      '/repo/kit/base.tokens.json': JSON.stringify(DOCUMENT.sets!.base.sources[0]),
      '/repo/kit/extra.tokens.json': JSON.stringify({ space: { $type: 'dimension', xl: { $value: { value: 32, unit: 'px' } } } }),
      '/repo/ui/panel.component.kdl': panel('{space.xl}'),
    };
    const both = await check(['kit/base.tokens.json', 'kit/extra.tokens.json', '--name', 'Kit', 'ui/panel.component.kdl'], files);
    assert.equal(both.code, 0, both.stderr);

    const one = await check(['kit/base.tokens.json', '--name', 'Kit', 'ui/panel.component.kdl'], files);
    assert.equal(one.code, 1);
    assert.match(one.stderr, /token \{space\.xl\} is not in the design system "Kit"/);
  });
});

// `chip.solid` varies along `interaction`: its hover part folds into `chip.solid.ink`'s variable, as a mode of the
// `interaction` collection. The pressed part is varied by the theme, so it keeps a variable of its own.
const FOLDED = {
  version: '2025-11-01',
  name: 'Tokens',
  sets: {
    base: {
      sources: [
        {
          $extensions: { 'com.toghen': { css: { parts: { interaction: { hover: ':hover', pressed: ':active' } } } } },
          chip: {
            solid: {
              ink: { $type: 'color', $value: srgb(0.1, 0.1, 0.1) },
              hover: { ink: { $type: 'color', $value: srgb(0.2, 0.2, 0.2) } },
              pressed: { ink: { $type: 'color', $value: srgb(0.3, 0.3, 0.3) } },
            },
          },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      default: 'light',
      contexts: { light: [{}], dark: [{ chip: { solid: { pressed: { ink: { $value: srgb(0.9, 0.9, 0.9) } } } } }] },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
} as unknown as ResolverDocument;

const swatch = (ink: string) => `component Swatch
FRAME Swatch layoutMode=HORIZONTAL {
    fills "{${ink}}"
}
`;

describe('toghen-figma check and a folded part', () => {
  const FOLDED_FILES = { '/repo/tokens.resolver.json': JSON.stringify(FOLDED) };

  it('refuses the name of a part the fold took into its rest, naming the rest and how a member pins the mode', async () => {
    const out = await check(['tokens.resolver.json', 'swatch.component.kdl'], {
      ...FOLDED_FILES,
      '/repo/swatch.component.kdl': swatch('chip.solid.hover.ink'),
    });
    assert.equal(out.code, 1);
    assert.match(
      out.stderr,
      /^swatch\.component\.kdl:3:\d+ token \{chip\.solid\.hover\.ink\} is the "hover" part of "chip\.solid\.ink", which is one variable with a mode per "interaction": name \{chip\.solid\.ink\}; the member pins the mode \(a tokens= axis, or modes interaction=hover\)$/m,
    );
  });

  it('takes the rest, and a part a modifier varies, which keeps its own variable', async () => {
    for (const ink of ['chip.solid.ink', 'chip.solid.pressed.ink']) {
      const out = await check(['tokens.resolver.json', 'swatch.component.kdl'], {
        ...FOLDED_FILES,
        '/repo/swatch.component.kdl': swatch(ink),
      });
      assert.equal(out.code, 0, out.stderr);
    }
  });

  it('takes a part of a component another file lays out as one variable per part, whatever the order of the files', async () => {
    const parts = 'component Chip tokens="{chip.solid}" layout=parts\nFRAME Chip layoutMode=HORIZONTAL\n';
    const out = await check(['tokens.resolver.json', 'swatch.component.kdl', 'chip.component.kdl'], {
      ...FOLDED_FILES,
      '/repo/swatch.component.kdl': swatch('chip.solid.hover.ink'),
      '/repo/chip.component.kdl': parts,
    });
    assert.equal(out.code, 0, out.stderr);
  });
});

describe("the plugin's check given a resolver", () => {
  it("reads the resolver it is given, not the plugin's state", () => {
    const resolver = new Resolver(DOCUMENT);
    const problems = checkComponentFiles([{ fileName: 'panel.component.kdl', text: panel('{space.xl}') }], { names: true }, resolver);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^panel\.component\.kdl:2:\d+ token \{space\.xl\} is not in the design system/);
  });
});
