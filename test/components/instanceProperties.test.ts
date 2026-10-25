import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { readComponentFile } from '../../shared/components/index.js';
import { byAddress, controlMock, runFile, stampOf } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// The atom a composite makes an instance of: a variant, a text, a boolean and a swap.
const ROW = `component PropertyRow
properties {
    VARIANT Kind plain required
    TEXT Name default="name"
    BOOLEAN Highlighted default=#false
    INSTANCE_SWAP Icon default=Glyph
}
FRAME PropertyRow layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    TEXT Label characters=(property)Name textStyle="{text.label}"
    INSTANCE Marker visible=(property)Highlighted component=(property)Icon
}
`;

// A composite: its one axis reaches the nested instance's variant, a literal its text, and a when adds the rest.
const card = (label: string, body = '', line = '') => `component Card
properties {
    VARIANT kind plain required
}
guard required { is (input)kind required }
FRAME Card layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    INSTANCE Mark component=PropertyRow ${line} {
        set Kind=(input)kind Name="${label}"
        when required { set Highlighted=#true Icon=Mark }
        ${body}
    }
}
`;

async function library(): Promise<FigmaMockHandle> {
  const mock = controlMock().withComponent('Mark').install();
  await runFile(mock, ROW, {}, 'row.component.kdl');
  return mock;
}

const membersOf = (mock: FigmaMockHandle, id: string | undefined): Map<string, Node> => {
  assert.ok(id, 'the run reported no set');
  return new Map((mock.node(id) as Node).children.map((member: Node) => [member.name, member]));
};
const markOf = (member: Node): Node => byAddress(member).get('Mark')!;
const propertiesOf = (instance: Node): Record<string, string | boolean> => {
  const out: Record<string, string | boolean> = {};
  for (const [key, property] of Object.entries(instance.componentProperties as Record<string, { value: string | boolean }>))
    out[key.split('#')[0]] = property.value;
  return out;
};

describe('a component file gives an instance its properties', () => {
  useFigmaMock();

  it('reads set on an instance of a member, the axis value written in as the member’s own', () => {
    const file = readComponentFile(card('Org'));
    assert.deepEqual(file.problems, []);
    const kinds = file.members.map((member) => [
      member.name,
      (byAddressOf(member.tree).get('Mark')!.fields.set as Record<string, { value: unknown }>).Kind.value,
    ]);
    assert.deepEqual(kinds, [
      ['kind=plain', 'plain'],
      ['kind=required', 'required'],
    ]);
  });

  it('sets the nested instance’s properties in every member: the axis, a literal, what a when adds, and leaves the rest', async () => {
    const mock = await library();
    const members = membersOf(mock, (await runFile(mock, card('Org'))).setId);

    const plain = propertiesOf(markOf(members.get('kind=plain')));
    assert.deepEqual(
      [plain.Kind, plain.Name, plain.Highlighted],
      ['plain', 'Org', false],
      'a property the file never mentions keeps the component’s default',
    );
    const required = propertiesOf(markOf(members.get('kind=required')));
    assert.deepEqual([required.Kind, required.Name, required.Highlighted], ['required', 'Org', true]);
    assert.equal((mock.node(String(required.Icon)) as Node)?.name, 'Mark', 'a swap holds the component’s id');
    // The suffixed key is Figma's: setProperties was handed the key the instance reports, never the display name alone.
    const calls = mock.calls('node.setProperties').map((call) => Object.keys(call.args[1] as object));
    assert.ok(
      calls.length > 0 && calls.every((keys) => keys.every((key) => key === 'Kind' || /^[A-Za-z]+#\d+:\d+$/.test(key))),
      JSON.stringify(calls),
    );
    assert.deepEqual(Object.keys(stampOf(markOf(members.get('kind=plain')))!.receipt), ['component', 'set Kind', 'set Name']);
  });

  it('with the literal changed, a second run patches the instance in each member and nothing else', async () => {
    const mock = await library();
    const first = await runFile(mock, card('Org'));
    const again = await runFile(mock, card('Org'));
    assert.deepEqual(
      again.steps.filter((step) => step.kind !== 'RELAYOUT'),
      [],
      'the same file plans nothing',
    );

    const report = await runFile(mock, card('Person'));
    assert.equal(report.setId, first.setId);
    assert.deepEqual(
      report.steps.filter((step) => step.kind !== 'RELAYOUT').map((step) => [step.kind, step.address]),
      [
        ['PATCH_LAYER', 'Mark'],
        ['PATCH_LAYER', 'Mark'],
      ],
    );
    for (const member of membersOf(mock, report.setId).values()) assert.equal(propertiesOf(markOf(member)).Name, 'Person');
  });

  it('compares a swap’s default with the component the file names: unchanged, a second run edits nothing; changed, it is set', async () => {
    const mock = await library();
    const edits = (steps: { kind: string }[]) =>
      steps.filter((step) => step.kind === 'EDIT_PROPERTY').map((step) => (step as { changes?: string[] }).changes);
    assert.deepEqual(edits((await runFile(mock, ROW, {}, 'row.component.kdl')).steps), []);
    assert.deepEqual(edits((await runFile(mock, ROW.replace('default=Glyph', 'default=Mark'), {}, 'row.component.kdl')).steps), [
      ['defaultValue'],
    ]);
  });

  it('exposes the nested instance’s properties on the composite’s instances with isExposedInstance, and takes it back', async () => {
    const mock = await library();
    const exposed = card('Org', '', 'isExposedInstance=#true');
    const members = membersOf(mock, (await runFile(mock, exposed)).setId);
    for (const member of members.values()) assert.equal(markOf(member).isExposedInstance, true, member.name);
    assert.deepEqual(Object.keys(stampOf(markOf(members.get('kind=plain')))!.receipt), [
      'component',
      'isExposedInstance',
      'set Kind',
      'set Name',
    ]);

    const report = await runFile(mock, card('Org', '', 'isExposedInstance=#false'));
    assert.deepEqual(
      report.steps.filter((step) => step.kind !== 'RELAYOUT').map((step) => [step.kind, step.address]),
      [
        ['PATCH_LAYER', 'Mark'],
        ['PATCH_LAYER', 'Mark'],
      ],
    );
    for (const member of membersOf(mock, report.setId).values()) assert.equal(markOf(member).isExposedInstance, false, member.name);
  });

  it('refuses a name the component lacks and a value its variant does not offer, said once though every member has the line', async () => {
    const mock = await library();
    const writes = mock.writes().length;
    await assert.rejects(runFile(mock, card('Org', 'set Nme="x"')), (error: Error) => {
      assert.match(
        error.message,
        /INSTANCE "Mark" \(line 10\): component "PropertyRow" has no property "Nme" \(it has "Kind", "Name", "Highlighted", "Icon"\)/,
      );
      assert.equal(error.message.match(/has no property "Nme"/g)?.length, 1, error.message);
      return true;
    });
    await assert.rejects(
      runFile(mock, card('Org', 'set Kind=wrong')),
      /"wrong" is not a value of component "PropertyRow" property "Kind" \("plain", "required"\)/,
    );
    assert.equal(mock.writes().length, writes, 'nothing was written');
  });
});

/** A member's layers by address, from the file's tree rather than Figma's nodes. */
function byAddressOf(tree: { address: string; children: (typeof tree)[]; fields: Record<string, unknown> }): Map<string, typeof tree> {
  const out = new Map<string, typeof tree>();
  const walk = (layer: typeof tree): void => {
    out.set(layer.address, layer);
    layer.children.forEach(walk);
  };
  walk(tree);
  return out;
}
