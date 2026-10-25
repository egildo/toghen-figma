import type { PropertyConvention } from '../../shared/conventions.js';
import type { Operation } from '../../shared/operations.js';
import { BOUND_BY_PARTS } from '../utils/boundVariables.js';

export interface ExpectedBinding {
  convention: PropertyConvention;
  variableName: string;
  property: string;
  exists: boolean;
  variableId?: string;
  isBound: boolean;
}

export interface AuditedBinding extends ExpectedBinding {
  status: 'missing_variable' | 'unbound' | 'ok';
}

export interface NodeAuditResult {
  nodeId: string;
  nodeName: string;
  bindings: AuditedBinding[];
}

async function slugFromNode(node: SceneNode): Promise<string> {
  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync();
    if (main) return main.name;
  }
  return node.name;
}

function variantFromNode(node: SceneNode): string {
  // Asked first: a node with no such member (a frame) has nothing to read.
  if (!('variantProperties' in node)) return '';
  const variantProperties = (node as unknown as { variantProperties?: Record<string, string> }).variantProperties;
  if (!variantProperties) return '';

  const keys = Object.keys(variantProperties);
  if (keys.length === 0) return '';

  return keys.map((key) => variantProperties[key]).join('/');
}

async function resolvePattern(pattern: string, node: SceneNode): Promise<string> {
  return (
    pattern
      .replace(/\{component\}/g, await slugFromNode(node))
      .replace(/\{variant\}/g, variantFromNode(node))
      // A node with no variants substitutes an empty string, so
      // `{component}/{variant}/bg` became `Card//bg`. Figma reads `/` as a group
      // separator, so that named a real variable inside an empty-named group.
      .replace(/\/{2,}/g, '/')
      .replace(/^\/|\/$/g, '')
  );
}

function matchVariableRef(bound: unknown, variableId: string): boolean {
  if (!bound) return false;

  if (typeof bound === 'string') {
    return bound === variableId;
  }

  if (Array.isArray(bound)) {
    return bound.some((entry) => matchVariableRef(entry, variableId));
  }

  if (typeof bound === 'object') {
    const record = bound as Record<string, unknown>;
    const id = record.id;
    const maybeVariableId = record.variableId;

    if (typeof id === 'string' && id === variableId) return true;
    if (typeof maybeVariableId === 'string' && maybeVariableId === variableId) return true;
  }

  return false;
}

function getPaintColorBindingId(node: SceneNode, property: string): unknown {
  const key = property.startsWith('fills[') ? 'fills' : property.startsWith('strokes[') ? 'strokes' : null;
  if (!key) return null;

  const paints = (node as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(paints) || paints.length === 0) return null;

  const first = paints[0] as Record<string, unknown>;
  const boundVariables = first?.boundVariables;
  if (!boundVariables || typeof boundVariables !== 'object') return null;

  return (boundVariables as Record<string, unknown>).color;
}

function isPropertyBound(node: SceneNode, property: string, variableId: string): boolean {
  if (property === 'fills[0].color' || property === 'strokes[0].color') {
    return matchVariableRef(getPaintColorBindingId(node, property), variableId);
  }

  const boundVariables = (node as unknown as { boundVariables?: Record<string, unknown> }).boundVariables;
  if (!boundVariables) return false;

  // Figma reports a bound `cornerRadius` or `strokeWeight` on its parts only.
  const parts = BOUND_BY_PARTS[property];
  if (parts && boundVariables[property] === undefined) return parts.every((part) => matchVariableRef(boundVariables[part], variableId));
  return matchVariableRef(boundVariables[property], variableId);
}

export class PropertyMapper {
  constructor(private readonly conventions: PropertyConvention[]) {}

  /**
   * The file's variables, fetched once per mapper.
   *
   * `getLocalVariablesAsync()` returns every variable in the file, and this used
   * to be called once per node *per convention* — auditing 200 nodes against 5
   * conventions fetched the whole table a thousand times.
   *
   * Caching for the life of the mapper is what makes that safe: a mapper is
   * built per handler call, so a scaffold run that creates variables gets a
   * fresh one on the next command rather than reading a table from before.
   */
  private variablesByName: Map<string, Variable[]> | null = null;

  private async findVariableByName(variableName: string, variableType?: VariableResolvedDataType): Promise<Variable | null> {
    if (!this.variablesByName) {
      this.variablesByName = new Map();
      for (const variable of await figma.variables.getLocalVariablesAsync()) {
        const existing = this.variablesByName.get(variable.name);
        if (existing) {
          existing.push(variable);
        } else {
          this.variablesByName.set(variable.name, [variable]);
        }
      }
    }

    // Names are not unique across collections, so the first match wins exactly
    // as it did when this scanned the whole array in order.
    for (const variable of this.variablesByName.get(variableName) ?? []) {
      if (variableType && variable.resolvedType !== variableType) continue;
      return variable;
    }
    return null;
  }

  async inferExpectedBindings(node: SceneNode): Promise<ExpectedBinding[]> {
    const applicable = this.conventions.filter((convention) => (convention.nodeTypes as string[]).includes(node.type));

    const results: ExpectedBinding[] = [];
    for (const convention of applicable) {
      const variableName = await resolvePattern(convention.pattern, node);
      const existing = await this.findVariableByName(variableName, convention.variableType);

      results.push({
        convention,
        variableName,
        property: convention.property,
        exists: !!existing,
        variableId: existing?.id,
        isBound: existing ? isPropertyBound(node, convention.property, existing.id) : false,
      });
    }

    return results;
  }

  async auditNode(node: SceneNode): Promise<NodeAuditResult> {
    const expected = await this.inferExpectedBindings(node);
    const bindings: AuditedBinding[] = expected.map((binding) => ({
      ...binding,
      status: !binding.exists ? 'missing_variable' : !binding.isBound ? 'unbound' : 'ok',
    }));

    return {
      nodeId: node.id,
      nodeName: node.name,
      bindings,
    };
  }

  async planScaffold(node: SceneNode, collectionId: string): Promise<Operation[]> {
    const bindings = await this.inferExpectedBindings(node);
    const operations: Operation[] = [];

    for (const binding of bindings) {
      const variableId = binding.variableId ?? `$var:${binding.variableName}`;

      if (!binding.exists) {
        operations.push({
          kind: 'CREATE_VARIABLE',
          symbolicId: variableId,
          collectionId,
          path: binding.variableName,
          variableType: binding.convention.variableType,
        });
      }

      if (!binding.isBound) {
        operations.push({
          kind: 'BIND_VARIABLE',
          nodeId: node.id,
          property: binding.property,
          variableId,
        });
      }
    }

    return operations;
  }

  async planApplyBindings(node: SceneNode): Promise<Operation[]> {
    return (await this.inferExpectedBindings(node))
      .filter((binding) => binding.exists && !binding.isBound && !!binding.variableId)
      .map((binding) => ({
        kind: 'BIND_VARIABLE' as const,
        nodeId: node.id,
        property: binding.property,
        variableId: binding.variableId as string,
      }));
  }
}
