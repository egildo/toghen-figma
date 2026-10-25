import type { Operation, StyleBinding } from '../../shared/operations.js';
import { FIELDS } from '../../shared/components/fields.js';
import { resolvedFor, writeToken } from '../components/fieldWriter.js';
import { getStamp, receiptOf, setStamp, strip } from '../components/stamp.js';
import { reportOf, reportedScopes, stampWritten } from '../utils/tokenStamps.js';

type BindableNode = SceneNode & {
  setBoundVariable?: (field: string, variable: Variable | null) => void;
};

function applyTextStyleProps(style: TextStyle, props: Record<string, unknown>): void {
  if (typeof props.fontFamily === 'string' && typeof props.fontStyle === 'string') {
    style.fontName = {
      family: props.fontFamily,
      style: props.fontStyle,
    };
  }

  if (typeof props.fontSize === 'number') {
    style.fontSize = props.fontSize;
  }

  if (props.lineHeight && typeof props.lineHeight === 'object') {
    style.lineHeight = props.lineHeight as LineHeight;
  }

  if (props.letterSpacing && typeof props.letterSpacing === 'object') {
    style.letterSpacing = props.letterSpacing as LetterSpacing;
  }

  if (typeof props.textCase === 'string') {
    style.textCase = props.textCase as TextCase;
  }

  if (typeof props.textDecoration === 'string') {
    style.textDecoration = props.textDecoration as TextDecoration;
  }
}

function applyEffectStyleProps(style: EffectStyle, props: Record<string, unknown>): void {
  if (Array.isArray(props.effects)) {
    style.effects = props.effects as ReadonlyArray<Effect>;
  }
}

function applyPaintStyleProps(style: PaintStyle, props: Record<string, unknown>): void {
  if (Array.isArray(props.paints)) {
    style.paints = props.paints as ReadonlyArray<Paint>;
  }
}

function applyStyleProps(style: BaseStyle, props: Record<string, unknown>): void {
  switch (style.type) {
    case 'TEXT':
      applyTextStyleProps(style as TextStyle, props);
      return;
    case 'EFFECT':
      applyEffectStyleProps(style as EffectStyle, props);
      return;
    case 'PAINT':
      applyPaintStyleProps(style as PaintStyle, props);
      return;
    default:
      throw new Error(`Unsupported style type: ${(style as BaseStyle).type}`);
  }
}

/** Every text style field a style plan may bind — the table in `styleSyncEngine.ts`. */
const BINDABLE_TEXT_FIELDS: readonly VariableBindableTextField[] = [
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fontSize',
  'letterSpacing',
  'lineHeight',
];

type BoundField = readonly [StyleBinding, Variable];

/**
 * Fetches every variable a style binds to. Called before the style is touched,
 * so a missing variable fails the operation with nothing written — and, on a
 * create, with no empty style left behind.
 */
async function variablesFor(bindings: readonly StyleBinding[] = []): Promise<BoundField[]> {
  return Promise.all(bindings.map(async (binding): Promise<BoundField> => [binding, await getVariableById(binding.variableId)]));
}

/** Writes a style's props, then binds its fields. */
function writeStyle(style: BaseStyle, props: Record<string, unknown>, bound: readonly BoundField[], existing: boolean): void {
  if (style.type === 'TEXT') {
    const text = style as TextStyle;
    // A bound field ignores a written value, so a member that is no longer a
    // reference would go on following the old variable. Clear, then write.
    if (existing) {
      for (const field of BINDABLE_TEXT_FIELDS) text.setBoundVariable(field, null);
    }
    applyTextStyleProps(text, props);
    for (const [binding, variable] of bound) {
      text.setBoundVariable(binding.field as VariableBindableTextField, variable);
    }
    return;
  }

  if (style.type === 'EFFECT' && bound.length > 0) {
    // Assigning `effects` replaces every earlier binding along with the layers,
    // so unlike a text style there is nothing to clear first.
    const effects = [...(props.effects as Effect[])];
    for (const [binding, variable] of bound) {
      const index = binding.index ?? 0;
      if (!effects[index]) {
        throw new Error(`Effect style has no layer ${index} to bind ${binding.field} to.`);
      }
      effects[index] = figma.variables.setBoundVariableForEffect(effects[index], binding.field as VariableBindableEffectField, variable);
    }
    (style as EffectStyle).effects = effects;
    return;
  }

  applyStyleProps(style, props);
}

/**
 * Node types that are not part of the scene graph and can never be bound to.
 *
 * `getNodeByIdAsync` resolves any node in the document, including the document
 * root and pages, so the result has to be narrowed before it is treated as a
 * `SceneNode`. The old code asserted `as SceneNode` outright, which would have
 * let a page id through to a property binding.
 */
const NON_SCENE_NODE_TYPES: ReadonlySet<string> = new Set(['DOCUMENT', 'PAGE']);

/**
 * Resolves a node id to a scene node.
 *
 * Uses the **async** accessor deliberately. `figma.getNodeById` is deprecated
 * and, per the Plugin API typings, *"will throw an exception if the plugin
 * manifest contains `documentAccess: dynamic-page`"* — which this plugin's
 * manifest does. Every `BIND_VARIABLE` and `UNBIND_VARIABLE` therefore failed in
 * a real Figma file, while the tests passed because no mock defined the method
 * and no test reached the binding branch.
 */
async function getSceneNodeById(nodeId: string): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  if (node.removed) {
    throw new Error(`Node has been removed: ${nodeId}`);
  }
  if (NON_SCENE_NODE_TYPES.has(node.type)) {
    throw new Error(`Node ${nodeId} is a ${node.type}, which cannot be bound to.`);
  }
  return node as SceneNode;
}

async function getVariableById(variableId: string): Promise<Variable> {
  const variable = await figma.variables.getVariableByIdAsync(variableId);
  if (!variable) {
    throw new Error(`Variable not found: ${variableId}`);
  }
  return variable;
}

function bindPaintColor(node: SceneNode, property: 'fills[0].color' | 'strokes[0].color', variable: Variable | null): void {
  const key = property.startsWith('fills[') ? 'fills' : 'strokes';
  const paints = (node as unknown as Record<string, unknown>)[key];

  if (!Array.isArray(paints) || paints.length === 0) {
    throw new Error(`Property ${property} requires at least one paint on node ${node.id}`);
  }

  const firstPaint = paints[0] as Paint;
  if (firstPaint.type !== 'SOLID') {
    throw new Error(`Property ${property} requires first paint to be SOLID on node ${node.id}`);
  }

  const bound = figma.variables.setBoundVariableForPaint(firstPaint, 'color', variable);
  (node as unknown as Record<string, unknown>)[key] = [bound, ...paints.slice(1)] as Paint[];
}

async function bindNodeProperty(node: SceneNode, property: string, variable: Variable | null): Promise<void> {
  if (property === 'fills[0].color' || property === 'strokes[0].color') {
    bindPaintColor(node, property, variable);
    return;
  }

  const bindable = node as BindableNode;
  if (!bindable.setBoundVariable) {
    throw new Error(`Node ${node.id} does not support variable binding for property ${property}`);
  }

  // A field of the field table is bound by the field writer, as a build and Apply bind it: one binding path.
  // A convention names its variable, not a token, so the variable stands for the token.
  if (variable && Object.prototype.hasOwnProperty.call(FIELDS, property) && FIELDS[property].token?.bind?.call === 'field') {
    await writeToken(node, property, variable.name, resolvedFor(variable));
    return;
  }

  bindable.setBoundVariable(property, variable);
}

/** Writes one operation to a file and answers the id of what it made or changed. */
export type OperationWriter = (op: Operation) => Promise<string | undefined>;

let writer: OperationWriter | undefined;

/**
 * Sends every operation to another file than Figma's: the command line's FigCraft target
 * (`cli/figcraft.ts`) writes through FigCraft's commands. `undefined` puts Figma's API back.
 */
export function writeOperationsWith(next: OperationWriter | undefined): void {
  writer = next;
}

/**
 * Writes one operation, to Figma or through the writer, then stamps what it wrote. The stamping reads the object back
 * through `figma`, Figma's own or the one the writer's target answers with, so both targets stamp the same fields.
 */
export async function executeOperation(op: Operation): Promise<string | undefined> {
  const id = writer ? await writer(op) : await writeToFigma(op);
  await stampAfter(op, id);
  return id;
}

async function writeToFigma(op: Operation): Promise<string | undefined> {
  switch (op.kind) {
    case 'CREATE_COLLECTION': {
      if (op.modes.length === 0) {
        throw new Error(`CREATE_COLLECTION requires at least one mode: ${op.name}`);
      }

      // The one internally multi-step operation, and so the only one that needs
      // to be transactional. A new collection always arrives with exactly one
      // mode, so this is rename-then-add-the-rest.
      //
      // If an addMode hits the plan's mode cap partway through, the collection
      // must not survive: it would exist by name, so the next run would take the
      // "already exists" branch, emit ADD_MODE, and hit the same cap forever —
      // leaving an empty collection the user has to find and delete by hand,
      // with nothing saying why.
      const collection = figma.variables.createVariableCollection(op.name);
      try {
        collection.renameMode(collection.modes[0].modeId, op.modes[0]);
        for (let i = 1; i < op.modes.length; i += 1) {
          collection.addMode(op.modes[i]);
        }
      } catch (error) {
        collection.remove();
        throw new Error(
          `Could not create collection "${op.name}" with ${op.modes.length} modes: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return collection.id;
    }

    case 'RENAME_VARIABLE': {
      const variable = await figma.variables.getVariableByIdAsync(op.variableId);
      if (!variable) {
        throw new Error(`Variable not found: ${op.variableId}`);
      }

      variable.name = op.name;
      return variable.id;
    }

    case 'SET_CODE_SYNTAX': {
      const variable = await figma.variables.getVariableByIdAsync(op.variableId);
      if (!variable) {
        throw new Error(`Variable not found: ${op.variableId}`);
      }

      variable.setVariableCodeSyntax(op.platform, op.value);
      return variable.id;
    }

    case 'ADD_MODE': {
      const collection = await figma.variables.getVariableCollectionByIdAsync(op.collectionId);
      if (!collection) {
        throw new Error(`Collection not found: ${op.collectionId}`);
      }

      collection.addMode(op.modeName);
      return collection.id;
    }

    case 'DELETE_MODE': {
      const collection = await figma.variables.getVariableCollectionByIdAsync(op.collectionId);
      if (!collection) {
        throw new Error(`Collection not found: ${op.collectionId}`);
      }
      // The default mode is the first, and Figma would promote the next one if it went: the plan never names it, and neither does this.
      if (collection.modes[0]?.modeId === op.modeId) {
        throw new Error(`The default mode "${op.modeName}" of collection "${op.collectionName}" is never deleted.`);
      }

      collection.removeMode(op.modeId);
      return collection.id;
    }

    case 'DELETE_VARIABLE': {
      const variable = await figma.variables.getVariableByIdAsync(op.variableId);
      if (!variable) {
        throw new Error(`Variable not found: ${op.variableId}`);
      }

      variable.remove();
      return op.variableId;
    }

    case 'CREATE_VARIABLE': {
      const collection = await figma.variables.getVariableCollectionByIdAsync(op.collectionId);
      if (!collection) {
        throw new Error(`Collection not found: ${op.collectionId}`);
      }

      const variable = figma.variables.createVariable(op.path, collection, op.variableType);
      if (op.scopes) variable.scopes = op.scopes;
      return variable.id;
    }

    case 'SET_VARIABLE_SCOPES': {
      const variable = await figma.variables.getVariableByIdAsync(op.variableId);
      if (!variable) {
        throw new Error(`Variable not found: ${op.variableId}`);
      }

      variable.scopes = op.scopes;
      return variable.id;
    }

    case 'SET_VARIABLE_VALUE': {
      const variable = await figma.variables.getVariableByIdAsync(op.variableId);
      if (!variable) {
        throw new Error(`Variable not found: ${op.variableId}`);
      }

      variable.setValueForMode(op.modeId, op.value);
      return variable.id;
    }

    // Nothing to write: the stamp is written after (`stampAfter`).
    case 'STAMP':
      return op.id;

    case 'BIND_VARIABLE': {
      const node = await getSceneNodeById(op.nodeId);
      const variable = await getVariableById(op.variableId);
      await bindNodeProperty(node, op.property, variable);
      return op.variableId;
    }

    case 'UNBIND_VARIABLE': {
      const node = await getSceneNodeById(op.nodeId);
      await bindNodeProperty(node, op.property, null);
      return undefined;
    }

    case 'APPLY_TOKEN': {
      // Answers the variable when the field was bound whole; nothing when it, or part of it, was written as the value in `op.context`.
      const node = await getSceneNodeById(op.nodeId);
      const variable = op.variableId === undefined ? undefined : await getVariableById(op.variableId);
      const atDefaults = op.value !== undefined && op.context !== undefined ? { value: op.value, context: op.context } : undefined;
      const written = await writeToken(node, op.field, op.path, resolvedFor(variable, atDefaults));
      return written.how === 'bound' ? written.variable.id : undefined;
    }

    case 'CREATE_STYLE': {
      const bound = await variablesFor(op.bindings);
      const style = (() => {
        switch (op.styleType) {
          case 'TEXT':
            return figma.createTextStyle() as BaseStyle;
          case 'EFFECT':
            return figma.createEffectStyle() as BaseStyle;
          case 'PAINT':
            return figma.createPaintStyle() as BaseStyle;
          default:
            throw new Error(`Unsupported styleType: ${op.styleType}`);
        }
      })();

      style.name = op.name;
      writeStyle(style, op.props, bound, false);
      return style.id;
    }

    case 'UPDATE_STYLE': {
      const style = await figma.getStyleByIdAsync(op.styleId);
      if (!style) {
        throw new Error(`Style not found: ${op.styleId}`);
      }

      writeStyle(style, op.props, await variablesFor(op.bindings), true);
      return style.id;
    }

    case 'SKIP':
    case 'WARNING':
    case 'BREAKING':
    case 'NOTE':
    case 'SWAP_COMPONENT':
      throw new Error(`No executor for operation kind: ${op.kind}`);

    default: {
      const _exhaustive: never = op;
      throw new Error(`Unhandled operation kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Stamps what `op` just wrote: each write is read back and stamped on the object, what the target reports rather than
 * what was sent, so a later read compares exactly though Figma stores a number less precisely than the document.
 * `id` is what the write answered: the id of a variable or style it made.
 */
async function stampAfter(op: Operation, id: string | undefined): Promise<void> {
  switch (op.kind) {
    case 'DELETE_VARIABLE':
      for (const id of op.strip ?? []) {
        const copy = await figma.variables.getVariableByIdAsync(id);
        if (copy) strip(copy);
      }
      return;
    case 'CREATE_VARIABLE':
    case 'SET_VARIABLE_SCOPES':
    case 'SET_VARIABLE_VALUE': {
      const token = op.kind === 'SET_VARIABLE_SCOPES' ? op.path : op.tokenPath;
      if (token === undefined) return;
      const variableId = op.kind === 'CREATE_VARIABLE' ? id : op.variableId;
      const variable = variableId === undefined ? null : await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) throw new Error(`Variable not found: ${variableId}`);
      // A new variable is stamped as soon as it exists, so a run that stops before its values still finds it by its stamp next time.
      const reported =
        op.kind === 'SET_VARIABLE_VALUE'
          ? { [op.modeId]: variable.valuesByMode[op.modeId] }
          : op.scopes
            ? { scopes: reportedScopes(variable.scopes) }
            : {};
      stampWritten(variable, token, reported);
      return;
    }
    case 'STAMP': {
      const object = op.target === 'variable' ? await figma.variables.getVariableByIdAsync(op.id) : await figma.getStyleByIdAsync(op.id);
      const stamp = object ? getStamp(object) : undefined;
      if (!object || !stamp) {
        throw new Error(`${op.target === 'variable' ? 'Variable' : 'Style'} not found: ${op.id}`);
      }
      // The same stamp, with the object's own id.
      setStamp(object, stamp);
      return;
    }
    case 'CREATE_STYLE':
    case 'UPDATE_STYLE': {
      const styleId = op.kind === 'UPDATE_STYLE' ? op.styleId : id;
      const style = styleId === undefined ? null : await figma.getStyleByIdAsync(styleId);
      if (!style) throw new Error(`Style not found: ${styleId}`);
      // A style is written whole, so its stamp is replaced whole, whatever token it named before.
      setStamp(style, { is: { token: op.tokenPath }, receipt: receiptOf(reportOf(style)) });
      return;
    }
    default:
      return;
  }
}

export function labelForOperation(op: Operation): string {
  switch (op.kind) {
    case 'CREATE_COLLECTION':
      return `Creating collection "${op.name}"`;
    case 'ADD_MODE':
      return `Adding mode "${op.modeName}" to "${op.collectionName}"`;
    case 'DELETE_MODE':
      return `Deleting mode "${op.modeName}" of "${op.collectionName}"`;
    case 'DELETE_VARIABLE':
      return `Deleting variable "${op.variableName}" of "${op.collectionName}"`;
    case 'CREATE_VARIABLE':
      return `Creating variable "${op.path}"`;
    case 'SET_VARIABLE_VALUE':
      return op.label;
    case 'RENAME_VARIABLE':
      return `Renaming variable to "${op.name}"`;
    case 'SET_CODE_SYNTAX':
      return `Writing code syntax ${op.value}`;
    case 'SET_VARIABLE_SCOPES':
      return `Writing scopes of "${op.path}"`;
    case 'STAMP':
      return `Stamping "${op.path}" with its id`;
    case 'BIND_VARIABLE':
      return `Binding ${op.property} on node ${op.nodeId}`;
    case 'UNBIND_VARIABLE':
      return `Unbinding ${op.property} on node ${op.nodeId}`;
    case 'APPLY_TOKEN':
      return `Applying ${op.path} to ${op.field} of "${op.nodeName}"`;
    case 'CREATE_STYLE':
      return `Creating ${op.styleType} style "${op.name}"`;
    case 'UPDATE_STYLE':
      return `Updating style "${op.tokenPath}"`;
    case 'SKIP':
      return `Skipping ${op.path}`;
    case 'WARNING':
    case 'BREAKING':
    case 'NOTE':
    case 'SWAP_COMPONENT':
      return op.message;
    default: {
      const _exhaustive: never = op;
      return String(_exhaustive);
    }
  }
}
