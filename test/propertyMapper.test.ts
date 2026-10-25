import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { PropertyMapper } from '../main/engines/propertyMapper.js';
import type { PropertyConvention } from '../shared/conventions.js';

function setVariableMock(variables: Array<{ id: string; name: string; resolvedType: VariableResolvedDataType }>) {
  installFigma({
    variables: {
      getLocalVariables: () => variables,
      getLocalVariablesAsync: async () => variables,
    },
  });
}

function createFrameNode(overrides?: Partial<SceneNode>): SceneNode {
  return {
    id: 'node_1',
    name: 'Button/Primary',
    type: 'FRAME',
    boundVariables: {},
    ...overrides,
  } as unknown as SceneNode;
}

describe('PropertyMapper', () => {
  beforeEach(() => {
    setVariableMock([]);
  });

  it('infers expected bindings and detects bound scalar properties', async () => {
    setVariableMock([
      {
        id: 'var_padding',
        name: 'Button/Primary/paddingLeft',
        resolvedType: 'FLOAT',
      },
    ]);

    const conventions: PropertyConvention[] = [
      {
        id: 'padding-left',
        pattern: '{component}/paddingLeft',
        property: 'paddingLeft',
        nodeTypes: ['FRAME'],
        variableType: 'FLOAT',
      },
    ];

    const node = createFrameNode({
      boundVariables: {
        // The real shape Figma stores. The old fixture was { id } alone,
        // which no Figma file ever produces.
        paddingLeft: { type: 'VARIABLE_ALIAS', id: 'var_padding' },
      },
    });

    const mapper = new PropertyMapper(conventions);
    const bindings = await mapper.inferExpectedBindings(node);

    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].variableName, 'Button/Primary/paddingLeft');
    assert.equal(bindings[0].exists, true);
    assert.equal(bindings[0].isBound, true);
    assert.equal(bindings[0].variableId, 'var_padding');
  });

  it('reads a radius Figma reports bound on its four corners as bound, and one corner bound apart as not', async () => {
    setVariableMock([{ id: 'var_radius', name: 'Button/Primary/radius', resolvedType: 'FLOAT' }]);
    const conventions: PropertyConvention[] = [
      { id: 'radius', pattern: '{component}/radius', property: 'cornerRadius', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
    ];
    const alias = (id: string) => ({ type: 'VARIABLE_ALIAS', id });
    // The shape Figma reports for a bound cornerRadius: the four corners, no `cornerRadius` key.
    const corners = {
      topLeftRadius: alias('var_radius'),
      topRightRadius: alias('var_radius'),
      bottomLeftRadius: alias('var_radius'),
      bottomRightRadius: alias('var_radius'),
    };
    const mapper = new PropertyMapper(conventions);

    const [bound] = await mapper.inferExpectedBindings(createFrameNode({ boundVariables: corners } as Partial<SceneNode>));
    assert.equal(bound.isBound, true);
    const [apart] = await mapper.inferExpectedBindings(
      createFrameNode({ boundVariables: { ...corners, topLeftRadius: alias('var_other') } } as Partial<SceneNode>),
    );
    assert.equal(apart.isBound, false);
  });

  it('detects paint color variable binding and reports ok status', async () => {
    setVariableMock([
      {
        id: 'var_fill',
        name: 'Button/Primary/fill',
        resolvedType: 'COLOR',
      },
    ]);

    const conventions: PropertyConvention[] = [
      {
        id: 'fill',
        pattern: '{component}/fill',
        property: 'fills[0].color',
        nodeTypes: ['FRAME'],
        variableType: 'COLOR',
      },
    ];

    const node = createFrameNode({
      fills: [
        {
          type: 'SOLID',
          color: { r: 1, g: 0, b: 0 },
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: 'var_fill' } },
        },
      ],
    });

    const mapper = new PropertyMapper(conventions);
    const audit = await mapper.auditNode(node);

    assert.equal(audit.bindings.length, 1);
    assert.equal(audit.bindings[0].status, 'ok');
  });

  it('plans scaffold operations for missing variable and unbound property', async () => {
    setVariableMock([]);

    const conventions: PropertyConvention[] = [
      {
        id: 'padding-left',
        pattern: '{component}/paddingLeft',
        property: 'paddingLeft',
        nodeTypes: ['FRAME'],
        variableType: 'FLOAT',
      },
    ];

    const mapper = new PropertyMapper(conventions);
    const node = createFrameNode();

    const ops = await mapper.planScaffold(node, 'VariableCollectionId:1');
    assert.equal(ops.length, 2);
    assert.equal(ops[0].kind, 'CREATE_VARIABLE');
    assert.equal(ops[1].kind, 'BIND_VARIABLE');
  });

  it('collapses an empty {variant} instead of leaving a double slash', async () => {
    // A plain frame has no variantProperties, so `{variant}` substitutes an
    // empty string. `Card//bg` is a legal Figma name, which is the problem:
    // `/` is a group separator, so it filed a real variable inside a group with
    // no name.
    setVariableMock([]);

    const conventions: PropertyConvention[] = [
      {
        id: 'bg',
        pattern: '{component}/{variant}/bg',
        property: 'fills[0].color',
        nodeTypes: ['FRAME'],
        variableType: 'COLOR',
      },
    ];

    const [binding] = await new PropertyMapper(conventions).inferExpectedBindings(createFrameNode({ name: 'Card' }));

    assert.equal(binding.variableName, 'Card/bg');
  });

  it('keeps every segment when the node does have variants', async () => {
    setVariableMock([]);

    const conventions: PropertyConvention[] = [
      {
        id: 'bg',
        pattern: '{component}/{variant}/bg',
        property: 'fills[0].color',
        nodeTypes: ['FRAME'],
        variableType: 'COLOR',
      },
    ];

    const node = createFrameNode({ name: 'Button' });
    (node as unknown as { variantProperties: Record<string, string> }).variantProperties = {
      Variant: 'Primary',
      Size: 'Large',
    };

    const [binding] = await new PropertyMapper(conventions).inferExpectedBindings(node);

    assert.equal(binding.variableName, 'Button/Primary/Large/bg');
  });

  it('reads the file’s variables once, not once per node per convention', async () => {
    // `getLocalVariablesAsync()` returns *every* variable in the file. Auditing
    // 200 nodes against 5 conventions used to fetch the whole table a thousand
    // times, which is the difference between an audit that returns and one the
    // user gives up on.
    let fetches = 0;
    installFigma({
      variables: {
        getLocalVariablesAsync: async () => {
          fetches += 1;
          return [];
        },
      },
    });

    const conventions: PropertyConvention[] = [
      { id: 'a', pattern: '{component}/a', property: 'paddingLeft', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
      { id: 'b', pattern: '{component}/b', property: 'paddingTop', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
    ];

    const mapper = new PropertyMapper(conventions);
    await mapper.auditNode(createFrameNode({ id: 'n1' }));
    await mapper.auditNode(createFrameNode({ id: 'n2' }));

    assert.equal(fetches, 1, `fetched the variable table ${fetches} times`);
  });

  it('starts from a fresh table on the next command', async () => {
    // The cache lives for one mapper, and a mapper is built per handler call.
    // Holding it any longer would make a scaffold run that creates variables
    // read a table from before they existed.
    let fetches = 0;
    installFigma({
      variables: {
        getLocalVariablesAsync: async () => {
          fetches += 1;
          return [];
        },
      },
    });

    const conventions: PropertyConvention[] = [
      { id: 'a', pattern: '{component}/a', property: 'paddingLeft', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
    ];

    await new PropertyMapper(conventions).auditNode(createFrameNode());
    await new PropertyMapper(conventions).auditNode(createFrameNode());

    assert.equal(fetches, 2);
  });
});
