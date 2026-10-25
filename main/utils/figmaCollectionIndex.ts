import { getStamp, sortOut, type Stamp } from '../components/stamp.js';

export interface IndexedMode {
  modeId: string;
  name: string;
}

export interface IndexedCollection {
  id: string;
  name: string;
  modes: IndexedMode[];
}

export interface IndexedVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: VariableResolvedDataType;
  /**
   * What Figma currently holds, per mode id.
   *
   * The plugin used to index a variable's identity and never its contents, so
   * it could not see a value a designer had changed by hand: every difference
   * it detected was a difference in the *document*. This is the other half of
   * the comparison.
   */
  valuesByMode: Record<string, VariableValue>;
  /** The code syntax Figma holds for the web, when it holds one. */
  codeSyntaxWeb?: string;
  /** What the variable may be bound to, in Figma's own order. */
  scopes: VariableScope[];
  /** What Toghen keeps on the variable: the token it holds and a receipt of what it wrote. Absent on one Toghen did not write. */
  stamp?: Stamp;
  /** Toghen's variable, moved: its stamp names another id, which the next write replaces with its own (`sortOut`). */
  moved?: true;
}

export interface FigmaCollectionIndex {
  byName: Record<string, IndexedCollection>;
  byId: Record<string, IndexedCollection>;
  variableById: Record<string, IndexedVariable>;
  variableByCollectionAndName: Record<string, IndexedVariable>;
  /** The variables stamped for each token, by the key the sync gives it: one, or more where a token moved collection and the old one is still there. A copy is not among them. */
  variablesByToken: Record<string, IndexedVariable[]>;
  /** The copies a person made of a variable Toghen wrote, each with the original: never written, never removed, never counted as Toghen's. */
  copies: Array<{ copy: IndexedVariable; of: IndexedVariable }>;
}

function pairKey(collectionId: string, variableName: string): string {
  return `${collectionId}::${variableName}`;
}

export async function indexFigmaCollections(): Promise<FigmaCollectionIndex> {
  const byName: Record<string, IndexedCollection> = {};
  const byId: Record<string, IndexedCollection> = {};
  const variableById: Record<string, IndexedVariable> = {};
  const variableByCollectionAndName: Record<string, IndexedVariable> = {};
  const variablesByToken: Record<string, IndexedVariable[]> = {};

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    const indexedCollection: IndexedCollection = {
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map((mode) => ({ modeId: mode.modeId, name: mode.name })),
    };

    byName[indexedCollection.name] = indexedCollection;
    byId[indexedCollection.id] = indexedCollection;
  }

  const variables = await figma.variables.getLocalVariablesAsync();
  const indexed: IndexedVariable[] = [];
  for (const variable of variables) {
    const stamp = getStamp(variable);
    const indexedVariable: IndexedVariable = {
      id: variable.id,
      name: variable.name,
      variableCollectionId: variable.variableCollectionId,
      resolvedType: variable.resolvedType,
      valuesByMode: { ...variable.valuesByMode },
      scopes: [...(variable.scopes ?? ['ALL_SCOPES'])],
      // measured 2026-10-08 (measured behaviour §10): `codeSyntax` reads back what `setVariableCodeSyntax` wrote, under the key 'WEB'
      ...(variable.codeSyntax?.WEB !== undefined ? { codeSyntaxWeb: variable.codeSyntax.WEB } : {}),
      ...(stamp ? { stamp } : {}),
    };

    variableById[indexedVariable.id] = indexedVariable;
    variableByCollectionAndName[pairKey(indexedVariable.variableCollectionId, indexedVariable.name)] = indexedVariable;
    indexed.push(indexedVariable);
  }

  const sorted = await sortOut(
    indexed,
    (variable) => variable.stamp,
    (id) => variableById[id],
  );
  for (const variable of sorted.ours) {
    if (sorted.moved.has(variable)) variable.moved = true;
    const token = variable.stamp?.is.token;
    if (token !== undefined) (variablesByToken[token] ??= []).push(variable);
  }

  return {
    byName,
    byId,
    variableById,
    variableByCollectionAndName,
    variablesByToken,
    copies: sorted.copies,
  };
}

export function getIndexedVariableByCollectionAndName(
  index: FigmaCollectionIndex,
  collectionId: string,
  variableName: string,
): IndexedVariable | undefined {
  return index.variableByCollectionAndName[pairKey(collectionId, variableName)];
}
