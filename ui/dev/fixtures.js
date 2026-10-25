/**
 * Fixture messages for the preview page, shaped as `shared/protocol.ts` says.
 *
 * One synthetic design system, Acme Tokens, described once as a table and
 * turned into every payload the screen reads: the document state, the file's
 * sync record, the collections Figma holds, and a correspondence picture.
 * Nothing here ships.
 */

const NOW = new Date();
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60000).toISOString();

/**
 * Every token of Acme Tokens.
 *
 * `in` is the collection the sum would put it in; `doc` the document's value per
 * mode of that collection; `figma` what Figma holds where it differs from the
 * document (`null` for a variable Figma does not have); `state` the
 * correspondence; `refs` what it points to.
 */
const T = [
  // The palette, in the base collection.
  ['palette.blue.600', 'color', 'acme', { default: '#0066cc' }],
  ['palette.blue.400', 'color', 'acme', { default: '#3d8ee6' }],
  ['palette.purple.700', 'color', 'acme', { default: '#6b21a8' }],
  ['palette.teal.700', 'color', 'acme', { default: '#0f766e' }],
  ['palette.red.600', 'color', 'acme', { default: '#dc2626' }],
  ['palette.green.600', 'color', 'acme', { default: '#16a34a' }],
  ['palette.grey.100', 'color', 'acme', { default: '#f5f5f5' }],
  ['palette.grey.900', 'color', 'acme', { default: '#1e1e1e' }],
  ['palette.white', 'color', 'acme', { default: '#ffffff' }],
  ['radius.sm', 'dimension', 'acme', { default: '6' }],
  ['radius.md', 'dimension', 'acme', { default: '8' }],
  // What varies with the theme.
  [
    'color.brand.primary',
    'color',
    'theme',
    { light: '#0066cc', dark: '#3d8ee6' },
    { figma: { dark: '#3a86d9' }, state: 'drifted', refs: ['palette.blue.600'] },
  ],
  ['color.brand.secondary', 'color', 'theme', { light: '#6b21a8', dark: '#6b21a8' }, { refs: ['palette.purple.700'] }],
  ['color.brand.tertiary', 'color', 'theme', { light: '#0f766e', dark: '#0f766e' }, { refs: ['palette.teal.700'] }],
  ['color.brand.inverse', 'color', 'theme', { light: '#ffffff', dark: '#1e1e1e' }, { figma: null, state: 'absent' }],
  ['color.button.bg', 'color', 'theme', { light: '#0066cc', dark: '#3d8ee6' }, { refs: ['color.brand.primary'] }],
  ['color.button.fg', 'color', 'theme', { light: '#ffffff', dark: '#ffffff' }, { refs: ['palette.white'] }],
  ['color.button.border', 'color', 'theme', { light: '#004d99', dark: '#7cc0ff' }],
  ['color.button.bg-hover', 'color', 'theme', { light: '#004d99', dark: '#5aa2ee' }],
  [
    'color.step.active.bg',
    'color',
    'theme',
    { light: '#0066cc', dark: '#3d8ee6' },
    { figma: { dark: '#3a86d9' }, state: 'drifted', refs: ['color.brand.primary'] },
  ],
  ['color.step.active.fg', 'color', 'theme', { light: '#ffffff', dark: '#1e1e1e' }],
  ['color.step.border', 'color', 'theme', { light: '#d9d9d9', dark: '#4a4a4a' }],
  ['color.step.done.bg', 'color', 'theme', { light: '#16a34a', dark: '#6fcf97' }, { refs: ['palette.green.600'] }],
  ['color.surface.base', 'color', 'theme', { light: '#ffffff', dark: '#1e1e1e' }],
  ['color.surface.raised', 'color', 'theme', { light: '#f5f5f5', dark: '#2c2c2c' }, { refs: ['palette.grey.100'] }],
  ['color.surface.sunken', 'color', 'theme', { light: '#f0f0f0', dark: '#242424' }],
  ['color.surface.overlay', 'color', 'theme', { light: '#1e1e1e', dark: '#000000' }],
  ['color.text.primary', 'color', 'theme', { light: '#1e1e1e', dark: '#f0f0f0' }, { refs: ['palette.grey.900'] }],
  ['color.text.secondary', 'color', 'theme', { light: '#6b6b6b', dark: '#a6a6a6' }],
  ['color.text.muted', 'color', 'theme', { light: '#a3a3a3', dark: '#6f6f6f' }],
  ['color.link', 'color', 'theme', { light: '#0066cc', dark: '#3d8ee6' }, { refs: ['color.brand.primary'] }],
  ['color.focus.ring', 'color', 'theme', { light: '#0066cc', dark: '#3d8ee6' }, { refs: ['color.brand.primary'] }],
  ['color.danger', 'color', 'theme', { light: '#dc2626', dark: '#ff6b6b' }, { refs: ['palette.red.600'] }],
  ['color.success', 'color', 'theme', { light: '#16a34a', dark: '#6fcf97' }, { refs: ['palette.green.600'] }],
  // What varies with density.
  ['space.xs', 'dimension', 'density', { default: '4', compact: '2' }],
  ['space.sm', 'dimension', 'density', { default: '8', compact: '6' }],
  ['space.md', 'dimension', 'density', { default: '16', compact: '12' }],
  ['space.lg', 'dimension', 'density', { default: '24', compact: '16' }],
  // What varies with state, which Figma does not have yet.
  ['color.control.bg', 'color', 'state', { rest: '#ffffff', hover: '#f0f0f0', active: '#e8e8e8' }, { figma: null, state: 'absent' }],
  ['color.control.fg', 'color', 'state', { rest: '#1e1e1e', hover: '#1e1e1e', active: '#0066cc' }, { figma: null, state: 'absent' }],
  ['color.control.border', 'color', 'state', { rest: '#d4d4d4', hover: '#a3a3a3', active: '#0066cc' }, { figma: null, state: 'absent' }],
  ['color.control.ring', 'color', 'state', { rest: '#0066cc', hover: '#0066cc', active: '#0066cc' }, { figma: null, state: 'absent' }],
  // A component's parts on the pointer axis, folded into a collection of their own, which Figma does not have yet.
  ['ui.chip.background', 'color', 'pointer', { rest: '#e6e6e6', hover: '#cccccc', pressed: '#b3b3b3' }, { figma: null, state: 'absent' }],
  ['ui.chip.border', 'color', 'pointer', { rest: '#d4d4d4', hover: '#a3a3a3', pressed: '#737373' }, { figma: null, state: 'absent' }],
  // Backed by styles, which nothing compares yet.
  ['type.label.md', 'typography', null, {}, { state: 'not_inspected' }],
  ['type.body.md', 'typography', null, {}, { state: 'not_inspected' }],
  ['type.heading.lg', 'typography', null, {}, { state: 'not_inspected' }],
  ['shadow.raised', 'shadow', null, {}, { state: 'not_inspected' }],
];

/** The document's name, which is also its base collection's and the first segment of every path. */
const DS = 'Acme Tokens';
const collectionOf = (home) => (home === 'acme' ? DS : home);
const MODIFIERS = { theme: ['light', 'dark'], density: ['default', 'compact'], state: ['rest', 'hover', 'active'] };
const STYLE_COUNT = T.filter(([, , home]) => home === null).length;

const NOTES = {
  drifted: 'Figma holds a different value in dark; the document has not changed since it was written. Edited in Figma.',
  absent: 'No Figma variable holds this token yet. The next variable sync creates it.',
  not_inspected: 'Backed by a Figma style. Style-backed tokens are not compared yet.',
};

function tokenReport([path, type, home, doc, extra = {}]) {
  const state = extra.state ?? 'current';
  const modes =
    home === null
      ? []
      : Object.entries(doc).map(([mode, value]) => {
          const figmaSide = extra.figma === null ? null : (extra.figma?.[mode] ?? value);
          return {
            mode: `${collectionOf(home)} / ${mode}`,
            present: true,
            documentValue: value,
            figmaValue: figmaSide,
            agrees: figmaSide === null ? null : figmaSide === value,
          };
        });
  return {
    path: `${DS}.${path}`,
    type,
    state,
    ...(NOTES[state] ? { note: NOTES[state] } : {}),
    ...(home !== null && state !== 'absent' ? { variableName: path.replace(/\./g, '/') } : {}),
    modes,
  };
}

function correspondence() {
  const tokens = T.map(tokenReport);
  const counts = { current: 0, drifted: 0, outdated: 0, absent: 0, adopted: 0, blocked: 0, not_inspected: 0 };
  for (const token of tokens) counts[token.state] += 1;
  return { checkedAt: at(2), collectionName: DS, tokens, counts };
}

/** The sum's modes: the defaults first, then each context that is not a default. */
const SUM_MODES = ['light/default/rest', 'dark/default/rest', 'light/compact/rest', 'light/default/hover', 'light/default/active'];
const CONTEXT_OF_MODE = {
  'dark/default/rest': 'dark',
  'light/compact/rest': 'compact',
  'light/default/hover': 'hover',
  'light/default/active': 'active',
};

/** The document as a graph: values per mode of the sum, and the edges. */
function tokenGraph() {
  const tokens = T.map(([path, type, home, doc, extra = {}]) => {
    const first = Object.values(doc)[0] ?? null;
    const valueByMode = {};
    for (const mode of SUM_MODES) {
      const context = CONTEXT_OF_MODE[mode];
      valueByMode[mode] =
        home === null ? (type === 'typography' ? '13px Inter 500' : 'shadow, 2 layers') : context && context in doc ? doc[context] : first;
    }
    return {
      path: `${DS}.${path}`,
      type,
      group: `${DS}.${path}`.split('.').slice(0, -1).join('.'),
      valueByMode,
      references: (extra.refs ?? []).map((ref) => `${DS}.${ref}`),
      referencedBy: [],
      codeSyntax: `--${path.replace(/\./g, '-')}`,
    };
  });
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  for (const token of tokens) for (const ref of token.references) byPath.get(ref)?.referencedBy.push(token.path);
  return { modes: SUM_MODES, tokens };
}

const documentState = {
  loaded: true,
  name: 'Acme Tokens',
  description: 'Primitives, semantics and component tokens for the Acme product family.',
  tokenCount: T.length,
  modifiers: MODIFIERS,
  modes: SUM_MODES,
  modifierDefaults: { theme: 'light', density: 'default', state: 'rest' },
  defaultMode: 'light/default/rest',
  version: '1.4.0',
  fileName: 'acme-tokens.resolver.json',
  styleCount: STYLE_COUNT,
  collections: [
    { name: DS, modes: ['default'], variableCount: T.filter(([, , home]) => home === 'acme').length },
    ...Object.entries(MODIFIERS).map(([name, modes]) => ({
      name,
      modifier: name,
      modes,
      variableCount: T.filter(([, , home]) => home === name).length,
    })),
    {
      name: 'pointer',
      axis: true,
      modes: ['rest', 'hover', 'pressed'],
      variableCount: T.filter(([, , home]) => home === 'pointer').length,
    },
  ],
  // A resolver document reading three files beside it, one of them sent elsewhere by an overrides map, and a map key that matched nothing.
  composition: {
    form: 'resolver',
    entry: 'acme-tokens.resolver.json',
    reads: [
      {
        ref: './primitives/palette.tokens.json',
        holder: 'acme-tokens.resolver.json',
        location: 'primitives/palette.tokens.json',
        overridden: false,
      },
      {
        ref: './semantic/color.tokens.json',
        holder: 'acme-tokens.resolver.json',
        location: 'semantic/color.next.tokens.json',
        overridden: true,
      },
      { ref: './themes/dark.tokens.json', holder: 'acme-tokens.resolver.json', location: 'themes/dark.tokens.json', overridden: false },
      { ref: './themes/light.tokens.json', holder: 'acme-tokens.resolver.json', location: 'themes/light.tokens.json', overridden: false },
    ],
    overrides: {
      map: {
        './semantic/color.tokens.json': 'semantic/color.next.tokens.json',
        './semantic/motion.tokens.json': 'semantic/motion.next.tokens.json',
      },
      hash: '5f1c0a9e',
      unused: ['./semantic/motion.tokens.json'],
    },
  },
};

/** The same system loaded again from its recent: the bundle, no file read. */
const fromBundle = { ...documentState, composition: { ...documentState.composition, fromBundle: true } };

/** Two token files merged into one collection, named on screen before Load ran. */
const tokenFiles = (name = 'Acme Brand', entry = ['brand/base.tokens.json', 'brand/dark.tokens.json']) => ({
  loaded: true,
  name,
  tokenCount: 14,
  modifiers: {},
  modes: ['default'],
  modifierDefaults: {},
  defaultMode: 'default',
  fileName: [entry].flat().join(', '),
  styleCount: 0,
  collections: [{ name, modes: ['default'], variableCount: 14 }],
  composition: {
    form: 'tokens',
    entry,
    reads: [entry].flat().map((location) => ({ ref: location, holder: `${name}.resolver.json`, location, overridden: false })),
  },
});

const nothingLoaded = {
  loaded: false,
  name: 'Untitled',
  tokenCount: 0,
  modifiers: {},
  modes: [],
  modifierDefaults: {},
  defaultMode: '',
  styleCount: 0,
};

const recorded = T.length - 5 - STYLE_COUNT;
const syncWithDocument = {
  hasRecord: true,
  recordedCount: recorded,
  documentTokenCount: T.length - STYLE_COUNT,
  coveredCount: recorded,
  partialCount: 0,
  recordNames: [DS],
};
const syncWithoutDocument = { ...syncWithDocument, documentTokenCount: null, coveredCount: null, partialCount: null };

const recents = [
  {
    key: 'Acme Tokens',
    name: 'Acme Tokens',
    version: '1.4.0',
    description: documentState.description,
    tokenCount: T.length,
    modes: documentState.modes,
    modifiers: Object.keys(MODIFIERS),
    fileName: 'acme-tokens.resolver.json',
    loadedAt: at(60 * 24 * 7),
  },
  {
    key: 'Acme Core',
    name: 'Acme Core',
    tokenCount: 128,
    modes: ['light', 'dark'],
    modifiers: ['theme'],
    fileName: 'acme-core.resolver.json',
    loadedAt: '2026-10-06T10:12:00.000Z',
  },
  {
    key: 'Demo',
    name: 'Demo',
    version: '0.3.1',
    tokenCount: 52,
    modes: ['light', 'dark'],
    fileName: 'demo.resolver.json',
    loadedAt: '2026-09-29T08:40:00.000Z',
  },
];

const figmaCollections = [
  { id: 'VariableCollectionId:1:1', name: DS, modes: [{ modeId: '1:0', name: 'default' }], variableCount: 11 },
  {
    id: 'VariableCollectionId:1:2',
    name: 'theme',
    modes: [
      { modeId: '2:0', name: 'light' },
      { modeId: '2:1', name: 'dark' },
    ],
    variableCount: 22,
  },
  {
    id: 'VariableCollectionId:1:3',
    name: 'density',
    modes: [
      { modeId: '3:0', name: 'default' },
      { modeId: '3:1', name: 'compact' },
    ],
    variableCount: 4,
  },
];

/** A variable sync plan: the absent ones created, a few updates, the two drifted skipped. */
function variablePlan() {
  const operations = [
    { kind: 'CREATE_COLLECTION', symbolicId: 'sym:state', name: 'state', modes: ['rest', 'hover', 'active'] },
    ...T.filter(([, , , , extra]) => extra?.state === 'absent').map(([path, , home]) => ({
      kind: 'CREATE_VARIABLE',
      symbolicId: `sym:${path}`,
      collectionId: home === 'state' ? 'sym:state' : 'VariableCollectionId:1:2',
      path: `${DS}.${path}`,
      variableType: 'COLOR',
    })),
    ...['color.button.border', 'color.text.muted', 'space.md'].map((path) => ({
      kind: 'SET_VARIABLE_VALUE',
      variableId: `VariableID:${path}`,
      modeId: '2:1',
      value: { r: 0, g: 0, b: 0, a: 1 },
      label: `${path} [dark]`,
      tokenPath: `${DS}.${path}`,
      modeName: 'dark',
    })),
    ...T.filter(([, , , , extra]) => extra?.state === 'drifted').map(([path]) => ({
      kind: 'SKIP',
      reason: 'drifted',
      path: `${DS}.${path}`,
      message: NOTES.drifted,
    })),
    ...T.filter(([, , , , extra]) => !extra?.state)
      .slice(0, 20)
      .map(([path]) => ({ kind: 'SKIP', reason: 'unchanged', path: `${DS}.${path}` })),
  ];
  const creates = operations.filter((op) => op.kind.startsWith('CREATE')).length;
  return {
    planType: 'variable_sync',
    operations,
    summary: { creates, updates: 3, skips: 22, drifted: 2 },
  };
}

/** A component dry run with one member removed, which breaks instances elsewhere. */
const buildPlan = {
  component: 'Stepper',
  report: {
    dryRun: true,
    created: ['state=active, size=lg'],
    updated: ['state=active, size=md', 'state=done, size=md'],
    deleted: ['state=done, size=sm'],
    notes: ['Stepper · effects: yours, not in the file · left alone', 'stepper.transition: no Figma field for this key · skipped'],
    breaking: [
      'state=done, size=sm: member removed. The file no longer lists this combination; 4 instances keep pointing at it and must be swapped by hand.',
    ],
    warnings: [],
    pending: ['{space.xl} · line 12: variable sync would create it'],
    steps: [
      {
        kind: 'DELETE_MEMBER',
        member: 'state=done, size=sm',
        breaks: 'The file no longer lists this combination; 4 instances keep pointing at it.',
      },
      { kind: 'PATCH_LAYER', member: 'state=active, size=md', address: 'Stepper · fills' },
      { kind: 'PATCH_LAYER', member: 'state=done, size=md', address: 'Stepper · fills' },
      { kind: 'CREATE_MEMBER', member: 'state=active, size=lg' },
      { kind: 'RELAYOUT' },
    ],
  },
};

const KEPT = '2026-10-07T16:20:00.000Z';
const p = (property, extra = {}) => ({ property, bound: null, literal: null, suggestion: null, declaredBy: null, ...extra });
const bound = (path) => ({ variableName: path.replace(/\./g, '/'), tokenPath: `${DS}.${path}` });

/** The fields the field table lists, with a token column, for a frame (an instance and a component definition read as one) and for a text. */
const FRAME_FIELDS = [
  'visible',
  'opacity',
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',
  'itemSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gridRowGap',
  'gridColumnGap',
  'strokeTopWeight',
  'strokeRightWeight',
  'strokeBottomWeight',
  'strokeLeftWeight',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomRightRadius',
  'bottomLeftRadius',
  'strokeWeight',
  'fills',
  'strokes',
  'effectStyle',
  'counterAxisSpacing',
  'x',
  'y',
  'cornerSmoothing',
  'dashPattern',
  'effects',
  'layoutGrids',
];
const TEXT_FIELDS = [
  'visible',
  'opacity',
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',
  'fills',
  'characters',
  'textStyle',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'paragraphIndent',
  'listSpacing',
  'maxLines',
  'x',
  'y',
  'effects',
];
const STYLE_FIELDS = new Set(['effectStyle', 'textStyle']);

/** A row per field: bound where `bound` names a token, plain otherwise, holding `holds[field]` or no one value. */
const fieldRows = (names, boundTo, holds) =>
  names.map((field) =>
    boundTo[field]
      ? { field, bound: { name: boundTo[field].replace(/\./g, '/'), tokenPath: `${DS}.${boundTo[field]}` } }
      : STYLE_FIELDS.has(field)
        ? { field, bound: null }
        : { field, bound: null, holds: holds[field] ?? null },
  );

/**
 * A stepper member a kept template built: bound, drifted, declared, and one fill of the designer's own; plain fields
 * holding what they hold, `x` among them as Apply wrote it, which reads as plain since no stamp records it.
 */
function selectionBindings(scope = 'selection') {
  return {
    scope,
    readAt: at(1),
    nodes: [
      {
        id: '12:40',
        name: 'Stepper / state=active, size=md',
        kind: 'COMPONENT',
        builtFrom: { template: 'Stepper', fileName: 'stepper.component.kdl', kept: KEPT },
        properties: [
          p('fills[0].color', { bound: bound('color.step.active.bg'), declaredBy: 'Stepper' }),
          p('strokes[0].color', { bound: bound('color.step.border'), declaredBy: 'Stepper' }),
          p('cornerRadius', { bound: bound('radius.sm'), declaredBy: 'Stepper' }),
          p('paddingLeft', { bound: bound('space.md'), declaredBy: 'Stepper' }),
          p('itemSpacing', { bound: bound('space.xs'), declaredBy: 'Stepper' }),
          p('opacity', { literal: '0.9' }),
        ],
        fields: fieldRows(
          FRAME_FIELDS,
          {
            fills: 'color.step.active.bg',
            strokes: 'color.step.border',
            cornerRadius: 'radius.sm',
            paddingLeft: 'space.md',
            itemSpacing: 'space.xs',
          },
          {
            visible: 'true',
            opacity: '0.9',
            width: '160',
            height: '40',
            paddingTop: '8',
            paddingRight: '16',
            paddingBottom: '8',
            strokeWeight: '1',
            strokeTopWeight: '1',
            strokeRightWeight: '1',
            strokeBottomWeight: '1',
            strokeLeftWeight: '1',
            topLeftRadius: '6',
            topRightRadius: '6',
            bottomRightRadius: '6',
            bottomLeftRadius: '6',
            minWidth: null,
            x: '8',
            y: '0',
            cornerSmoothing: '0',
            counterAxisSpacing: '0',
            gridRowGap: '0',
            gridColumnGap: '0',
          },
        ),
      },
      {
        id: '12:44',
        name: 'Caption',
        kind: 'TEXT',
        builtFrom: { template: 'Stepper', fileName: 'stepper.component.kdl', kept: KEPT },
        properties: [p('fills[0].color', { literal: '#1e1e1e', suggestion: `${DS}.color.step.active.fg`, declaredBy: 'Stepper' })],
        fields: fieldRows(
          TEXT_FIELDS,
          {},
          {
            visible: 'true',
            opacity: '1',
            width: '120',
            height: '16',
            fills: '#1e1e1e',
            characters: 'Step 2',
            fontSize: '12',
            fontWeight: '500',
            x: '16',
            y: '12',
          },
        ),
      },
    ],
  };
}

/** Apply's plan: a group on two instances, every field bound, and one fill whose colour's alpha is written as its value. */
const APPLY_LAYERS = [
  ['12:60', 'Button / primary'],
  ['12:61', 'Button / quiet'],
];
const DEFAULTS = 'light/default/rest';
function applyPlan({ tokens = 'color.button', field } = {}) {
  const written = (layer, what, at) =>
    `"${at}" of "${layer}": ${what} is written as its value in "${DEFAULTS}"; it will not follow the token until the next run`;
  const operations = field
    ? // One token on the field it was given: bound where Figma binds the field, written as its value where it cannot.
      APPLY_LAYERS.map(([nodeId, nodeName]) =>
        ['x', 'y', 'cornerSmoothing'].includes(field)
          ? {
              kind: 'APPLY_TOKEN',
              nodeId,
              nodeName,
              field,
              path: tokens,
              value: 8,
              context: DEFAULTS,
              written: written(nodeName, 'the token', field),
            }
          : { kind: 'APPLY_TOKEN', nodeId, nodeName, field, path: tokens, variableId: 'VariableID:9:2' },
      )
    : [
        ...APPLY_LAYERS.flatMap(([nodeId, nodeName]) => [
          { kind: 'APPLY_TOKEN', nodeId, nodeName, field: 'fills', path: `${tokens}.backgroundColor`, variableId: 'VariableID:9:3' },
          { kind: 'APPLY_TOKEN', nodeId, nodeName, field: 'strokes', path: `${tokens}.borderColor`, variableId: 'VariableID:9:4' },
        ]),
        {
          kind: 'APPLY_TOKEN',
          nodeId: '12:62',
          nodeName: 'Button / veiled',
          field: 'fills',
          path: `${tokens}.veil`,
          variableId: 'VariableID:9:5',
          value: { r: 0, g: 0.4, b: 0.8, a: 0.5 },
          context: DEFAULTS,
          written: written('Button / veiled', "the colour's alpha", 'fills'),
        },
        {
          kind: 'APPLY_TOKEN',
          nodeId: '12:62',
          nodeName: 'Button / veiled',
          field: 'x',
          path: `${tokens}.inset`,
          value: 12,
          context: DEFAULTS,
          written: written('Button / veiled', 'the token', 'x'),
        },
        { kind: 'SKIP', reason: '"foreground" has no field on this layer in Figma, skipped', path: 'Button / veiled' },
      ];
  const applies = operations.filter((op) => op.kind === 'APPLY_TOKEN');
  return {
    planType: 'apply',
    operations,
    summary: {
      total: operations.length,
      applies: applies.length,
      written: applies.filter((op) => op.written).length,
      skips: operations.length - applies.length,
      warnings: 0,
    },
  };
}

const summary = (name, members, axes, extra = {}) => ({
  name,
  fileName: `${name.toLowerCase()}.component.kdl`,
  kept: KEPT,
  characters: 3104,
  members,
  axes,
  properties: [
    { name: 'label', type: 'TEXT' },
    { name: 'showIcon', type: 'BOOLEAN' },
  ],
  tokenGroups: [name.toLowerCase()],
  builtInto: { page: 'Components', setId: `1:${members}` },
  differs: null,
  problems: [],
  ...extra,
});

function templates() {
  return {
    lookedAt: at(3),
    templates: [
      summary('Notice', 8, [
        { name: 'tone', values: ['info', 'warn', 'err', 'ok'] },
        { name: 'size', values: ['sm', 'md'] },
      ]),
      summary('Stepper', 6, [
        { name: 'state', values: ['default', 'active', 'done'] },
        { name: 'size', values: ['sm', 'md'] },
      ]),
      summary(
        'Toggle',
        4,
        [
          { name: 'State', values: ['off', 'on'] },
          { name: 'size', values: ['sm', 'md'] },
        ],
        { builtInto: null },
      ),
      summary('Control', 6, [
        { name: 'state', values: ['rest', 'hover', 'active'] },
        { name: 'scale', values: ['default', 'small'] },
      ]),
      blueprint,
    ],
  };
}

/* ── The Build pane: a kept blueprint, its needs in every state, and a lock of two libraries ── */

const ICON_KEY = `${'a'.repeat(38)}0a`;

/** A kept blueprint whose needs reach every state a look can answer. */
const blueprint = {
  name: 'Buttons',
  fileName: 'buttons.blueprint.kdl',
  kept: KEPT,
  characters: 1840,
  members: 6,
  axes: [],
  properties: [],
  tokenGroups: [],
  builtInto: null,
  differs: null,
  problems: [],
  needs: {
    tokens: { entries: ['tokens/acme-tokens.resolver.json'] },
    libraries: ['Core', 'Toghen Test Library', 'Marks'],
    components: [
      { name: 'Button', satisfied: true },
      { name: 'Icon', satisfied: false },
      { name: 'Dot', satisfied: false },
      { name: 'Pin', satisfied: false },
      { name: 'Arrow', satisfied: false },
      { name: 'Badge', satisfied: false },
      { name: `(key)"${ICON_KEY}"`, satisfied: false },
    ],
  },
};

/** What a look at the blueprint's needs found. */
const needs = () => ({
  name: 'Buttons',
  lookedAt: at(2),
  tokens: { entries: ['tokens/acme-tokens.resolver.json'], state: 'loaded' },
  libraries: [
    { name: 'Core', state: 'in the lock', by: 'build' },
    { name: 'Toghen Test Library', state: 'in the lock', by: 'discovery' },
    { name: 'Marks', state: 'missing' },
  ],
  components: [
    { name: 'Button', state: 'satisfied', detail: 'a component of this blueprint' },
    { name: 'Icon', state: 'would swap', library: 'Core', detail: '2 stamped instances show another component now' },
    { name: 'Dot', state: 'found', detail: 'in this file' },
    { name: 'Pin', state: 'from a library', library: 'Core' },
    { name: 'Arrow', state: 'missing', detail: "not in this file, and no declared library's lock entry holds it" },
    { name: 'Badge', state: 'problem', detail: 'in this file and in library "Core": a build stops on it' },
    { name: `(key)"${ICON_KEY}"`, state: 'by key', detail: 'a published key: a look imports nothing, so it is not checked' },
  ],
  notes: [],
});

/** The lock: two libraries, one with the file key a run could read, and Build's overrides map. Changed by the answers below. */
const lock = {
  libraries: {
    Core: {
      by: 'build',
      fileKey: 'Xq7Synthetic0Key',
      components: {
        Icon: { key: ICON_KEY, set: false },
        Pin: { key: 'b'.repeat(40), set: false },
        Badge: { key: 'c'.repeat(40), set: true },
      },
      styles: { 'type.label.md': { key: 'd'.repeat(40), kind: 'TEXT' } },
      variables: {},
    },
    'Toghen Test Library': {
      by: 'discovery',
      components: {},
      styles: {},
      variables: { 'theme/color/brand/primary': 'e'.repeat(40), 'density/space/sm': 'f'.repeat(40) },
    },
  },
  overrides: { Glyph: 'Icon' },
};

/** A relink plan: two swaps, and the line for the library they import from. */
const relinkPlan = {
  planType: 'relink',
  operations: [
    {
      kind: 'SWAP_COMPONENT',
      path: 'Buttons',
      message: '"Glyph" in "Badge/Tone=calm" swaps from "Icon (old)" (this file) to "Icon" from library "Core"',
    },
    {
      kind: 'SWAP_COMPONENT',
      path: 'Buttons',
      message: '"Glyph" in "Badge/Tone=loud" swaps from "Icon (old)" (this file) to "Icon" from library "Core"',
    },
    {
      kind: 'NOTE',
      message:
        '2 swaps import from library "Core" by key, which needs the library published and its update accepted in this file; the plugin cannot see whether it is. If the build says a key did not import, publish the library, then accept its update here.',
    },
  ],
  summary: { swaps: 2, libraries: 1, stopped: 0 },
};

/** The scenes the page's buttons post, in order. */
export const scenes = {
  'Nothing loaded': [
    { type: 'WINDOW_MODE', payload: { mode: 'narrow' } },
    { type: 'DOCUMENT_STATE', payload: nothingLoaded },
    { type: 'SYNC_STATE', payload: syncWithoutDocument },
    { type: 'RECENTS', payload: recents },
  ],
  'Acme Tokens loaded': [
    { type: 'DOCUMENT_LOADED', payload: documentState },
    { type: 'TOKEN_GRAPH', payload: tokenGraph() },
    { type: 'SYNC_STATE', payload: syncWithDocument },
    { type: 'RECENTS', payload: recents },
    { type: 'FIGMA_COLLECTIONS', payload: figmaCollections },
  ],
  'Token files loaded': [
    { type: 'DOCUMENT_LOADED', payload: tokenFiles() },
    {
      type: 'SYNC_STATE',
      payload: { hasRecord: false, recordedCount: 0, documentTokenCount: 14, coveredCount: 0, partialCount: 0, recordNames: [] },
    },
    { type: 'FIGMA_COLLECTIONS', payload: [] },
  ],
  Correspondence: [{ type: 'CORRESPONDENCE', payload: correspondence() }],
  Selection: [{ type: 'SELECTION_BINDINGS', payload: selectionBindings() }],
  'Apply plan': [{ type: 'PLAN_READY', payload: applyPlan() }],
  'Four templates': [{ type: 'TEMPLATES', payload: templates() }],
  Build: [
    { type: 'TEMPLATES', payload: templates() },
    { type: 'LOCK', payload: lock },
    { type: 'NEEDS', payload: needs() },
  ],
  'Relink plan': [{ type: 'PLAN_READY', payload: relinkPlan }],
  'Build plan, breaking': [{ type: 'COMPONENT_RUN', payload: buildPlan }],
};

/**
 * What the main thread would answer, for the commands the screen sends.
 *
 * Enough of the main thread to round-trip Plan and Execute and the looks; a
 * command it does not know is only logged by the page.
 */
export function answer(command, loaded) {
  switch (command.type) {
    case 'GET_DOCUMENT_STATE':
      return [{ type: 'DOCUMENT_STATE', payload: loaded ? documentState : nothingLoaded }];
    case 'GET_SYNC_STATE':
      return [{ type: 'SYNC_STATE', payload: loaded ? syncWithDocument : syncWithoutDocument }];
    case 'RESIZE_UI':
      return command.payload.mode ? [{ type: 'WINDOW_MODE', payload: { mode: command.payload.mode } }] : [];
    case 'GET_RECENTS':
      return [{ type: 'RECENTS', payload: recents }];
    case 'GET_FIGMA_COLLECTIONS':
      return [{ type: 'FIGMA_COLLECTIONS', payload: figmaCollections }];
    case 'LOAD_DOCUMENT':
      // Token files carry a name; a resolver document does not.
      return command.payload.name
        ? [{ type: 'DOCUMENT_LOADED', payload: tokenFiles(command.payload.name, command.payload.entry) }]
        : scenes['Acme Tokens loaded'];
    case 'LOAD_RECENT':
      return [{ ...scenes['Acme Tokens loaded'][0], payload: fromBundle }, ...scenes['Acme Tokens loaded'].slice(1)];
    case 'READ_SELECTION_BINDINGS':
      return [{ type: 'SELECTION_BINDINGS', payload: selectionBindings(command.payload.scope) }];
    case 'COUNT_BOUND_LAYERS':
      return [
        {
          type: 'BOUND_LAYERS',
          payload: { variableName: command.payload.variableName, ids: ['12:40', '12:41', '12:52'], pageName: 'Components' },
        },
      ];
    case 'GET_TEMPLATES':
    case 'KEEP_TEMPLATE':
    case 'FORGET_TEMPLATE':
      return [{ type: 'TEMPLATES', payload: templates() }];
    case 'PLAN_BUILD':
      return [{ type: 'COMPONENT_RUN', payload: { ...buildPlan, component: command.payload.name } }];
    case 'GET_LOCK':
      return [{ type: 'LOCK', payload: lock }];
    case 'LOCK_FORGET':
      delete lock.libraries[command.payload.library];
      return [{ type: 'LOCK', payload: lock }];
    case 'SET_BUILD_OVERRIDES':
      lock.overrides = command.payload.overrides;
      return [{ type: 'LOCK', payload: lock }];
    case 'LOCK_PICK':
      lock.libraries[command.payload.library] ??= { by: 'person', components: {}, styles: {}, variables: {} };
      lock.libraries[command.payload.library] = {
        ...lock.libraries[command.payload.library],
        by: 'person',
        components: { ...lock.libraries[command.payload.library].components, Arrow: { key: '1'.repeat(40), set: false } },
      };
      return [{ type: 'LOCK', payload: lock }];
    case 'LOOK_UP_NEEDS':
      return [{ type: 'NEEDS', payload: { ...needs(), lookedAt: new Date().toISOString() } }];
    case 'PLAN_RELINK':
      return [{ type: 'PLAN_READY', payload: relinkPlan }];
    case 'DISCOVER_VARIABLES':
      return [
        {
          type: 'PLAN_READY',
          payload: {
            planType: 'discovery',
            operations: [{ kind: 'NOTE', message: '{color.brand.primary}: "theme/color/brand/primary" in library "Toghen Test Library".' }],
            summary: { found: 1, choices: 0, 'not found': 0 },
          },
        },
        { type: 'LOCK', payload: lock },
      ];
    case 'EXECUTE_BUILD':
      return [
        { type: 'COMPONENT_RUN', payload: { component: command.payload.name, report: { ...buildPlan.report, dryRun: false } } },
        { type: 'TEMPLATES', payload: templates() },
      ];
    case 'PLAN_APPLY_BINDINGS':
      return [
        {
          type: 'PLAN_READY',
          payload: {
            planType: 'apply_bindings',
            operations: [
              {
                kind: 'BIND_VARIABLE',
                nodeId: command.payload.nodeId ?? '12:44',
                property: command.payload.property ?? 'fills[0].color',
                variableId: 'VariableID:9:1',
              },
            ],
            summary: { total: 1, binds: 1, skips: 0, warnings: 0 },
          },
        },
      ];
    case 'PLAN_APPLY':
      return [{ type: 'PLAN_READY', payload: applyPlan(command.payload) }];
    case 'GET_TOKEN_GRAPH':
      return [{ type: 'TOKEN_GRAPH', payload: tokenGraph() }];
    case 'INSPECT_CORRESPONDENCE':
      return [{ type: 'CORRESPONDENCE', payload: correspondence() }];
    case 'PLAN_VARIABLE_SYNC':
      return [{ type: 'PLAN_READY', payload: variablePlan() }];
    case 'PLAN_STYLE_SYNC':
      return [
        {
          type: 'PLAN_READY',
          payload: { planType: 'style_sync', operations: [], summary: { creates: 0, updates: 0, skips: STYLE_COUNT } },
        },
      ];
    case 'EXECUTE_VARIABLE_SYNC':
    case 'EXECUTE_STYLE_SYNC':
    case 'EXECUTE_SCAFFOLD':
    case 'EXECUTE_APPLY_BINDINGS':
    case 'EXECUTE_APPLY':
      return [
        { type: 'OPERATION_PROGRESS', payload: { completed: 3, total: 8, currentLabel: 'color.control.bg' } },
        {
          type: 'OPERATION_COMPLETE',
          payload: { total: 8, applied: 7, skipped: 1, failed: 0, cancelled: 0, durationMs: 412, results: [] },
        },
        { type: 'SYNC_STATE', payload: syncWithDocument },
      ];
    default:
      return [];
  }
}
