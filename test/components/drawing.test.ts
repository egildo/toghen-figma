import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired, Layer, Problem, Value } from '../../shared/components/index.js';
import { byAddress, rgba } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any

const errors = (problems: Problem[]): string[] => problems.filter((p) => p.severity === 'error').map((p) => p.message);
const warnings = (problems: Problem[]): Problem[] => problems.filter((p) => p.severity === 'warning');

function desiredFrom(text: string): Desired {
  const file = readComponentFile(text);
  assert.deepEqual(errors(file.problems), [], text);
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
}

/** A file with one root and the given layers under it. */
const component = (name: string, body: string, header = ''): string => `component ${name}
${header}
FRAME ${name} layoutMode=VERTICAL {
${body}
}
`;

const find = (layer: Layer, address: string): Layer | undefined =>
  layer.address === address ? layer : layer.children.map((child) => find(child, address)).find((found) => found !== undefined);

/** Synthetic tokens only: a stroke colour, two lengths, a radius, a text style and a shadow's effect style. */
const drawingMock = () =>
  createFigmaMock()
    .withFonts([{ family: 'Inter', style: 'Regular' }])
    .withCollection('Demo', ['light'])
    .withVariable('Demo', 'stroke/strong', 'COLOR', { light: rgba(0.2, 0.2, 0.3) })
    .withVariable('Demo', 'stroke/thin', 'FLOAT', { light: 1 })
    .withVariable('Demo', 'radius/md', 'FLOAT', { light: 6 })
    .withVariable('Demo', 'radius/lg', 'FLOAT', { light: 12 })
    .withStyle('EFFECT', 'shadow/raised', {});

describe('a LINE layer: the reader', () => {
  /** `fields` are properties of the line; `children` are what is written inside its braces, structured fields included. */
  const line = (fields: string, children = ''): string =>
    component('Ruler', `    LINE Tick ${fields}${children ? ` {\n${children}\n    }` : ''}`);

  it('reads a line with its length, strokes, stroke weight and rotation', () => {
    const file = readComponentFile(
      line('width=(literal)120 rotation=90 strokeWeight="{stroke.thin}"', '        strokes "{stroke.strong}"'),
    );
    assert.deepEqual(file.problems, []);
    const tick = find(file.members[0].tree, 'Tick')!;
    assert.equal(tick.kind, 'LINE');
    assert.deepEqual(tick.fields, {
      width: { kind: 'literal', value: 120 },
      rotation: { kind: 'plain', value: 90 },
      strokes: [{ kind: 'token', path: 'stroke.strong' }],
      strokeWeight: { kind: 'token', path: 'stroke.thin' },
    });
  });

  it('refuses height, minHeight and maxHeight: Figma’s line has none', () => {
    for (const field of ['height', 'minHeight', 'maxHeight']) {
      const file = readComponentFile(line(`width=(literal)10 ${field}=(literal)2`));
      assert.deepEqual(errors(file.problems), [
        `"${field}" does not apply to a LINE layer, in LINE "Tick": a line has a length, width, and no height`,
      ]);
    }
  });

  it('keeps the layer fields a line shares with the others, and refuses the ones that need a box', () => {
    assert.deepEqual(errors(readComponentFile(line('width=(literal)10 opacity=(literal)0.5 layoutSizingHorizontal=FILL')).problems), []);
    assert.deepEqual(errors(readComponentFile(line('cornerRadius="{radius.md}"')).problems), [
      '"cornerRadius" does not apply to a LINE layer, in LINE "Tick"',
    ]);
    assert.deepEqual(errors(readComponentFile(line('', '        fills "{stroke.strong}"')).problems), [
      '"fills" does not apply to a LINE layer, in LINE "Tick"',
    ]);
  });

  it('refuses child layers', () => {
    const file = readComponentFile(line('width=(literal)10', '        FRAME Cap layoutMode=NONE'));
    assert.deepEqual(errors(file.problems), ['LINE "Tick" cannot hold FRAME "Cap": a LINE has no child layers']);
  });
});

describe('per-corner radii, rotation and effectStyle: the reader', () => {
  const layer = (fields: string): string => component('Card', `    FRAME Box layoutMode=NONE ${fields}`);

  it('reads cornerRadius with the four corners, as dimensions', () => {
    const file = readComponentFile(
      layer(
        'cornerRadius="{radius.md}" topLeftRadius=(literal)0 topRightRadius="{radius.lg}" bottomRightRadius=(literal)2 bottomLeftRadius="{radius.lg}"',
      ),
    );
    assert.deepEqual(file.problems, []);
    assert.deepEqual(find(file.members[0].tree, 'Box')!.fields, {
      layoutMode: { kind: 'plain', value: 'NONE' },
      cornerRadius: { kind: 'token', path: 'radius.md' },
      topLeftRadius: { kind: 'literal', value: 0 },
      topRightRadius: { kind: 'token', path: 'radius.lg' },
      bottomRightRadius: { kind: 'literal', value: 2 },
      bottomLeftRadius: { kind: 'token', path: 'radius.lg' },
    });
  });

  it('refuses a bare number for a corner, as for any dimension, and a corner on a text', () => {
    assert.match(
      errors(readComponentFile(layer('topLeftRadius=4')).problems)[0],
      /"topLeftRadius" takes a token reference or a \(literal\) number: a bare 4/,
    );
    const text = component('Card', '    TEXT Label characters="x" bottomLeftRadius=(literal)2');
    assert.deepEqual(errors(readComponentFile(text).problems), ['"bottomLeftRadius" does not apply to a TEXT layer, in TEXT "Label"']);
  });

  it('takes rotation as a bare number of degrees on every kind of layer, negative and fractional too', () => {
    const body = `    FRAME Box layoutMode=NONE rotation=-90
    TEXT Label characters="x" rotation=90
    LINE Tick width=(literal)8 rotation=45.5`;
    const file = readComponentFile(component('Card', body));
    assert.deepEqual(file.problems, []);
    const root = file.members[0].tree;
    assert.deepEqual(
      ['Box', 'Label', 'Tick'].map((address) => (find(root, address)!.fields.rotation as Value & { value: number }).value),
      [-90, 90, 45.5],
    );
  });

  it('refuses a rotation that is a token or not a number', () => {
    assert.deepEqual(errors(readComponentFile(layer('rotation="{radius.md}"')).problems), [
      '"rotation" takes a number of degrees, not "{radius.md}"',
    ]);
    assert.deepEqual(errors(readComponentFile(layer('rotation="90deg"')).problems), ['"rotation" takes a number of degrees, not "90deg"']);
  });

  it('reads effectStyle as a token reference, on a FRAME or SLOT only', () => {
    const file = readComponentFile(layer('effectStyle="{shadow.raised}"'));
    assert.deepEqual(file.problems, []);
    assert.deepEqual(find(file.members[0].tree, 'Box')!.fields.effectStyle, { kind: 'token', path: 'shadow.raised' });
    assert.deepEqual(errors(readComponentFile(layer('effectStyle=(literal)3')).problems), [
      '"effectStyle" takes a token reference such as "{text.body}", not (literal)3',
    ]);
    const text = component('Card', '    TEXT Label characters="x" effectStyle="{shadow.raised}"');
    assert.deepEqual(errors(readComponentFile(text).problems), ['"effectStyle" does not apply to a TEXT layer, in TEXT "Label"']);
  });
});

describe('(literal) on a wired field: the reader', () => {
  const status = (rule: string, extra = ''): string => `component Status
properties {
    VARIANT State idle ready
    TEXT Label default="Idle"
    BOOLEAN "Show Icon" default=#true
}
guard ready { is (input)State ready }
FRAME Status layoutMode=HORIZONTAL {
    TEXT Caption characters=(property)Label {
        ${rule}
    }
    FRAME Icon layoutMode=NONE visible=(property)"Show Icon" {
        ${extra}
    }
}
`;

  it('says nothing when a when fixes the text on purpose', () => {
    const file = readComponentFile(status('when ready characters=(literal)"Ready"'));
    assert.deepEqual(file.problems, []);
    const ready = file.members.find((m) => m.name === 'State=ready')!;
    assert.deepEqual(find(ready.tree, 'Caption')!.fields.characters, { kind: 'literal', value: 'Ready' });
  });

  it('still warns, for that member only, when the when writes a plain value', () => {
    const file = readComponentFile(status('when ready characters="Ready"'));
    assert.deepEqual(errors(file.problems), []);
    assert.deepEqual(
      warnings(file.problems).map((p) => [p.member, p.message]),
      [['State=ready', 'TEXT property "Label" is wired to nothing in this member']],
    );
  });

  it('says nothing when a when hides the layer on purpose with a literal boolean', () => {
    const file = readComponentFile(status('', 'when ready visible=(literal)#false'));
    assert.deepEqual(file.problems, []);
    const ready = file.members.find((m) => m.name === 'State=ready')!;
    assert.deepEqual(find(ready.tree, 'Icon')!.fields.visible, { kind: 'literal', value: false });
  });

  it('warns for a plain #false, and for a literal that sits on another field than the one wired', () => {
    assert.deepEqual(
      warnings(readComponentFile(status('', 'when ready visible=#false')).problems).map((p) => p.message),
      ['BOOLEAN property "Show Icon" is wired to nothing in this member'],
    );
    // A literal on a layer or field the property was not wired to does not stand for the missing wire.
    const elsewhere = status('when ready opacity=(literal)0.5', 'when ready visible=#false');
    assert.equal(warnings(readComponentFile(elsewhere).problems).length, 1);
  });

  it('does not excuse a property wired to no layer at all', () => {
    const file = readComponentFile(`component Status
properties {
    TEXT Label default="Idle"
}
FRAME Status layoutMode=HORIZONTAL {
    TEXT Caption characters=(literal)"Always"
}
`);
    assert.match(errors(file.problems)[0], /TEXT property "Label" is wired to no layer in any member/);
  });

  it('keeps refusing a literal of the wrong type on a wirable field', () => {
    assert.match(
      errors(readComponentFile(status('when ready characters=(literal)3')).problems)[0],
      /"characters" takes text or \(property\)/,
    );
  });
});

describe('a LINE layer, the corners, rotation and the fixed text: the engine', () => {
  useFigmaMock();

  it('draws a line of the given length, rotated, with the stroke the file declares and none it does not', async () => {
    const mock = drawingMock().install();
    const body = `    LINE Tick width=(literal)120 rotation=90 strokeWeight="{stroke.thin}" {
        strokes "{stroke.strong}"
    }
    LINE Bare width=(literal)40`;
    const report = await run(desiredFrom(component('Ruler', body)));
    const layers = byAddress(mock.node(report.setId!) as Node);
    const tick = layers.get('Tick')!;
    assert.equal(mock.calls('createLine').length, 2);
    assert.equal(tick.type, 'LINE');
    assert.equal(tick.width, 120);
    assert.equal(tick.height, 0);
    assert.equal(tick.rotation, 90);
    assert.equal(tick.strokes[0].boundVariables.color.id, mock.variable('Demo', 'stroke/strong')!.id);
    assert.equal(
      tick.boundVariables.strokeTopWeight.id,
      mock.variable('Demo', 'stroke/thin')!.id,
      'Figma reports a bound stroke weight on its sides',
    );
    assert.equal(layers.get('Bare')!.strokes.length, 0, 'a line the file gives no stroke starts with none');
    assert.equal(layers.get('Bare')!.rotation, 0);
  });

  it('applies cornerRadius first and each corner over it, bound to its token or written as a literal', async () => {
    const mock = drawingMock().install();
    const body = `    FRAME Box layoutMode=NONE topLeftRadius=(literal)0 topRightRadius="{radius.lg}" cornerRadius="{radius.md}"`;
    const report = await run(desiredFrom(component('Panel', body)));
    const box = byAddress(mock.node(report.setId!) as Node).get('Box')!;
    assert.equal(box.topLeftRadius, 0);
    assert.equal(box.topRightRadius, 12);
    assert.equal(box.bottomRightRadius, 6, 'the corners the file does not name keep cornerRadius');
    assert.equal(box.bottomLeftRadius, 6);
    assert.equal(box.boundVariables.topRightRadius.id, mock.variable('Demo', 'radius/lg')!.id);
    assert.equal(
      box.boundVariables.bottomLeftRadius.id,
      mock.variable('Demo', 'radius/md')!.id,
      'Figma reports a bound radius on its corners',
    );
    assert.equal(box.boundVariables.cornerRadius, undefined);
    const writes = mock.writes().filter((call) => call.api === 'node.set' || call.api === 'node.setBoundVariable');
    const order = writes.map((call) => String(call.args[1])).filter((field) => /Radius$/.test(field));
    assert.ok(order.indexOf('cornerRadius') < order.indexOf('topLeftRadius'), order.join(' '));
  });

  it('rotates a text and a frame by the degrees the file gives', async () => {
    const mock = drawingMock().install();
    const body = `    TEXT Vertical characters="Axis" rotation=90\n    FRAME Tilted layoutMode=NONE rotation=-15.5`;
    const report = await run(desiredFrom(component('Label', body)));
    const layers = byAddress(mock.node(report.setId!) as Node);
    assert.equal(layers.get('Vertical')!.rotation, 90);
    assert.equal(layers.get('Tilted')!.rotation, -15.5);
  });

  const status = (rule: string): string => `component Status
properties {
    VARIANT State idle ready
    TEXT Label default="Idle"
    BOOLEAN "Show Icon" default=#true
}
guard ready { is (input)State ready }
FRAME Status layoutMode=HORIZONTAL {
    TEXT Caption characters=(property)Label {
        ${rule}
    }
    FRAME Icon layoutMode=NONE visible=(property)"Show Icon" {
        when ready visible=(literal)#false
    }
}
`;

  it('writes a (literal) text and boolean in the member and leaves the field off its property', async () => {
    const mock = drawingMock().install();
    const report = await run(desiredFrom(status('when ready characters=(literal)"Ready"')));
    const set = mock.node(report.setId!) as Node;
    const [idle, ready] = ['State=idle', 'State=ready'].map((name) => set.children.find((member: Node) => member.name === name));
    assert.equal(byAddress(idle).get('Caption')!.characters, 'Idle');
    assert.deepEqual(Object.keys(byAddress(idle).get('Caption')!.componentPropertyReferences), ['characters']);
    assert.equal(byAddress(ready).get('Caption')!.characters, 'Ready');
    assert.deepEqual(byAddress(ready).get('Caption')!.componentPropertyReferences, {});
    assert.equal(byAddress(ready).get('Icon')!.visible, false);
    assert.deepEqual(byAddress(ready).get('Icon')!.componentPropertyReferences, {});
    assert.deepEqual(Object.keys(byAddress(idle).get('Icon')!.componentPropertyReferences), ['visible']);
  });

  it('takes a layer off its property when a later run makes its value a literal', async () => {
    const mock = drawingMock().install();
    const first = await run(desiredFrom(status('')));
    const set = mock.node(first.setId!) as Node;
    const ready = () => set.children.find((member: Node) => member.name === 'State=ready');
    assert.deepEqual(Object.keys(byAddress(ready()).get('Caption')!.componentPropertyReferences), ['characters']);

    const second = await run(desiredFrom(status('when ready characters=(literal)"Ready"')));
    assert.equal(second.setId, first.setId);
    assert.equal(byAddress(ready()).get('Caption')!.characters, 'Ready');
    assert.deepEqual(byAddress(ready()).get('Caption')!.componentPropertyReferences, {});
  });
});

describe('effectStyle: the engine', () => {
  useFigmaMock();

  const shadowed = component('Card', '    FRAME Box layoutMode=NONE effectStyle="{shadow.raised}"');

  it('sets the effect style that style sync made from the shadow token', async () => {
    const mock = drawingMock().install();
    const [style] = await figmaOf().getLocalEffectStylesAsync();
    const report = await run(desiredFrom(shadowed));
    assert.equal(byAddress(mock.node(report.setId!) as Node).get('Box')!.effectStyleId, style.id);
  });

  it('stops with the layer’s line and writes nothing when the style does not exist yet', async () => {
    const mock = createFigmaMock().install();
    await assert.rejects(run(desiredFrom(shadowed)), (error: Error & { problems?: string[] }) => {
      assert.match(error.message, /1 thing the file names could not be resolved, and nothing was written/);
      assert.deepEqual(error.problems, ['effect style {shadow.raised} (line 4) names no effect style']);
      return true;
    });
    assert.equal(mock.writes().length, 0);
  });

  it('counts, in a dry run, a style the sync would create as present, and reports it', async () => {
    createFigmaMock().install();
    const report = await run(desiredFrom(shadowed), {
      dryRun: true,
      pending: { variables: [], textStyles: [], effectStyles: ['shadow/raised'] },
    });
    assert.deepEqual(report.pending, ['effect style {shadow.raised} (line 4): the style sync would create "shadow/raised"']);
    await assert.rejects(run(desiredFrom(shadowed), { dryRun: true, pending: { variables: [], textStyles: [] } }), /names no effect style/);
  });
});
