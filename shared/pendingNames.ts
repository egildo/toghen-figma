import type { Pending } from './components/steps.js';
import type { Operation } from './operations.js';

/**
 * The names a run of plans would create, in the shape a component dry run takes as `pending`.
 *
 * `operations` are those of a variable plan and a style plan, in the order they were made. A
 * `CREATE_VARIABLE` names its collection by id, which is the id of one that exists
 * (`collections`, as `GET_FIGMA_COLLECTIONS` answers) or the symbolic id of one the plan
 * creates (`CREATE_COLLECTION`). Only text and effect styles are kept: they are the only styles a component file names.
 * The modes of a collection the plan creates, and a mode it adds to one, are kept too, for a `modes` pin.
 * A variable whose collection is neither is left out, since there is no name to give it.
 * A variable a plan removes because its token moved to another collection (a `BREAKING` row that says so) is kept as removed.
 */
export function pendingNames(operations: readonly Operation[], collections: readonly { id: string; name: string }[]): Pending {
  const collectionName = new Map(collections.map((collection) => [collection.id, collection.name]));
  for (const operation of operations) {
    if (operation.kind === 'CREATE_COLLECTION' && operation.symbolicId) collectionName.set(operation.symbolicId, operation.name);
  }

  const pending: Pending = { variables: [], textStyles: [], effectStyles: [], modes: [] };
  for (const operation of operations) {
    if (operation.kind === 'CREATE_COLLECTION') {
      for (const mode of operation.modes) pending.modes!.push({ collection: operation.name, mode });
    } else if (operation.kind === 'ADD_MODE') {
      pending.modes!.push({ collection: operation.collectionName, mode: operation.modeName });
    } else if (operation.kind === 'BREAKING' && operation.moved) {
      (pending.removed ??= []).push(operation.moved);
    } else if (operation.kind === 'CREATE_VARIABLE') {
      const collection = collectionName.get(operation.collectionId);
      if (collection !== undefined) pending.variables.push({ collection, name: operation.path, type: operation.variableType });
    } else if (operation.kind === 'CREATE_STYLE' && operation.styleType === 'TEXT') {
      pending.textStyles.push(operation.name);
    } else if (operation.kind === 'CREATE_STYLE' && operation.styleType === 'EFFECT') {
      pending.effectStyles!.push(operation.name);
    }
  }
  return pending;
}
