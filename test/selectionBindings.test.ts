/**
 * What the selection is bound to, the layers bound to one variable on the
 * page, selecting them, and binding one property from the Selection pane.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { READ_SELECTION_BINDINGS } from '../main/handlers/readSelectionBindings.js';
import { COUNT_BOUND_LAYERS, SELECT_NODES } from '../main/handlers/boundLayers.js';
import { PLAN_APPLY_BINDINGS } from '../main/handlers/planApplyBindings.js';
import { LOAD_CONVENTIONS } from '../main/handlers/loadConventions.js';
import { stampWritten } from '../main/utils/tokenStamps.js';
import { resetState } from '../main/runtimeState.js';
import type { Response } from '../shared/protocol.js';

const posted = (mock: FigmaMockHandle) => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);

/** A card on the current page: its radius bound, a red fill of its own, and a padding the conventions would bind. */
async function scene() {
  const mock = createFigmaMock()
    .withCollection('Demo', ['light'])
    .withVariable('Demo', 'radius/md', 'FLOAT', { light: 6 })
    .withVariable('Demo', 'Card/paddingLeft', 'FLOAT', { light: 16 })
    .install();
  const [radius, padding] = await figma.variables.getLocalVariablesAsync();
  const card = figma.createFrame();
  card.name = 'Card';
  card.setBoundVariable('cornerRadius', radius);
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }];
  const other = figma.createFrame();
  other.name = 'Other';
  figma.currentPage.selection = [card];
  stampWritten(radius, 'Demo.radius.md', {});
  stampWritten(padding, 'Demo.card.paddingLeft', {});
  return { mock, card, other };
}

describe('READ_SELECTION_BINDINGS', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('names the variable each property is bound to, and the token its stamp says it is', async () => {
    const { mock } = await scene();
    await READ_SELECTION_BINDINGS({ scope: 'selection' });

    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'SELECTION_BINDINGS');
    const [node] = answer.payload.nodes;
    assert.equal(node.name, 'Card');
    assert.equal(node.kind, 'FRAME');
    const radius = node.properties.find((property) => property.property === 'cornerRadius');
    assert.deepEqual(radius?.bound, { variableName: 'radius/md', tokenPath: 'Demo.radius.md' });
    // The fill is the card's own: listed with what it holds.
    const fill = node.properties.find((property) => property.property === 'fills[0].color');
    assert.equal(fill?.bound, null);
    assert.equal(fill?.literal, '#ff0000');
  });

  it('suggests what the loaded conventions would bind, as a token path', async () => {
    const { mock } = await scene();
    await LOAD_CONVENTIONS({
      json: JSON.stringify([
        { id: 'pad', pattern: '{component}/paddingLeft', property: 'paddingLeft', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
      ]),
    });
    await READ_SELECTION_BINDINGS({ scope: 'selection' });

    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'SELECTION_BINDINGS');
    const padding = answer.payload.nodes[0].properties.find((property) => property.property === 'paddingLeft');
    assert.equal(padding?.suggestion, 'Demo.card.paddingLeft');
  });

  it('reads the page when asked, every layer on it', async () => {
    const { mock } = await scene();
    await READ_SELECTION_BINDINGS({ scope: 'page' });
    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'SELECTION_BINDINGS');
    assert.deepEqual(
      answer.payload.nodes.map((node) => node.name),
      ['Card', 'Other'],
    );
  });
});

describe('COUNT_BOUND_LAYERS and SELECT_NODES', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('finds the layers on this page bound to a variable of that name', async () => {
    const { mock, card } = await scene();
    await COUNT_BOUND_LAYERS({ variableName: 'radius/md' });
    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'BOUND_LAYERS');
    assert.deepEqual(answer.payload, { variableName: 'radius/md', ids: [card.id], pageName: 'Page 1' });
  });

  it('finds none for a variable nothing uses', async () => {
    const { mock } = await scene();
    await COUNT_BOUND_LAYERS({ variableName: 'Card/paddingLeft' });
    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'BOUND_LAYERS');
    assert.deepEqual(answer.payload.ids, []);
  });

  it('selects the layers and brings them into view', async () => {
    const { mock, other } = await scene();
    await SELECT_NODES({ ids: [other.id, 'no-such-node'] });
    assert.deepEqual(
      figma.currentPage.selection.map((node) => node.id),
      [other.id],
    );
    assert.deepEqual(mock.calls('viewport.scrollAndZoomIntoView').at(-1)?.args[0], [other.id]);
  });
});

describe('PLAN_APPLY_BINDINGS for one node and property', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('plans only that binding', async () => {
    const { mock, card } = await scene();
    await LOAD_CONVENTIONS({
      json: JSON.stringify([
        { id: 'pad', pattern: '{component}/paddingLeft', property: 'paddingLeft', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
        { id: 'radius', pattern: 'radius/md', property: 'topLeftRadius', nodeTypes: ['FRAME'], variableType: 'FLOAT' },
      ]),
    });

    await PLAN_APPLY_BINDINGS({ query: '**', scope: 'page', nodeId: card.id, property: 'paddingLeft' });
    const plan = posted(mock).at(-1)!;
    assert.ok(plan.type === 'PLAN_READY');
    assert.deepEqual(
      plan.payload.operations.map((op) => (op.kind === 'BIND_VARIABLE' ? [op.nodeId, op.property] : op.kind)),
      [[card.id, 'paddingLeft']],
    );
  });
});
