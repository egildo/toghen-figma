import type { Command, Response } from '../../shared/protocol.js';
import type { PropertyConvention } from '../../shared/conventions.js';
import { getState, setState } from '../runtimeState.js';

type LoadConventionsCommand = Extract<Command, { type: 'LOAD_CONVENTIONS' }>;

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseConventions(json: string): PropertyConvention[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Conventions file must be a JSON array.');
  }

  return parsed.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Convention at index ${index} must be an object.`);
    }

    const id = entry.id;
    const pattern = entry.pattern;
    const property = entry.property;
    const nodeTypes = entry.nodeTypes;
    const variableType = entry.variableType;
    const description = entry.description;

    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Convention at index ${index} has invalid "id".`);
    }
    if (typeof pattern !== 'string' || !pattern.trim()) {
      throw new Error(`Convention "${id}" has invalid "pattern".`);
    }
    if (typeof property !== 'string' || !property.trim()) {
      throw new Error(`Convention "${id}" has invalid "property".`);
    }
    if (!Array.isArray(nodeTypes) || nodeTypes.some((nodeType) => typeof nodeType !== 'string')) {
      throw new Error(`Convention "${id}" has invalid "nodeTypes".`);
    }
    if (typeof variableType !== 'string' || !variableType.trim()) {
      throw new Error(`Convention "${id}" has invalid "variableType".`);
    }

    return {
      id,
      pattern,
      property,
      nodeTypes: nodeTypes as NodeType[],
      variableType: variableType as VariableResolvedDataType,
      ...(typeof description === 'string' ? { description } : {}),
    };
  });
}

export async function LOAD_CONVENTIONS(payload: LoadConventionsCommand['payload']): Promise<void> {
  try {
    const conventions = parseConventions(payload.json);
    setState({ conventions });

    postToUi({
      type: 'CONVENTIONS_LOADED',
      payload: { count: conventions.length },
    });
  } catch (error) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: error instanceof Error ? error.message : String(error),
        code: 'INVALID_CONVENTIONS',
        commandType: 'LOAD_CONVENTIONS',
      },
    });
  }
}

export async function GET_CONVENTIONS(): Promise<void> {
  postToUi({
    type: 'CONVENTIONS_LOADED',
    payload: { count: getState().conventions.length },
  });
}
