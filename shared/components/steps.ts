/**
 * What the Figma-side engine is given, what it plans, and what it reports.
 *
 * These are the contract between the command that prints a script and the engine
 * the script runs, so they are plain JSON and free of any Figma type. The shapes
 * are owned by `reference.md`, *Component files*.
 */

import type { Component, Layer, Member, Property } from './model.js';

/** What the file says about a set, apart from its members. */
export type SetSpec = Pick<Component, 'name' | 'description' | 'properties' | 'across'>;

/** A component file after `readComponentFile`: the set's name and properties, and the members to build. */
export interface Desired {
  component: SetSpec;
  members: Member[];
  /** An artboard file: `component` holds only its name, and `members` its one frame. */
  artboard?: true;
}

/**
 * What an earlier step of the same run would create, by the names the engine's lookup compares.
 *
 * A dry run of several steps writes nothing, so what a later step names does not exist yet. The plans of
 * the earlier steps say it will, and `pending` carries that: a variable by its collection, its full name and
 * its type, a text or effect style by its full name.
 */
export interface Pending {
  variables: { collection: string; name: string; type: VariableResolvedDataType }[];
  textStyles: string[];
  /** Effect styles a plan would create, by full name; absent reads as none. */
  effectStyles?: string[];
  /** Modes a plan would create, by collection name: a new collection's modes, or one added to an existing collection. */
  modes?: { collection: string; mode: string }[];
  /** Variables a plan would remove because their token moved to another collection, by collection and full name: counted as gone. */
  removed?: { collection: string; name: string }[];
  /** Component sets a file earlier in the same dry run would create, by name: counted as present, their instances' properties and slots unchecked. */
  components?: string[];
}

export interface RunOptions {
  /** The page the set lives on, by name. The current page when absent. */
  page?: string;
  /** Plan and return the steps, and write nothing. */
  dryRun?: boolean;
  /** Take the steps that break instances elsewhere. Without it a real run that has any stops before its first write. */
  allowBreaking?: boolean;
  /** Write the file's value over a field someone changed by hand since Toghen wrote it. Without it the edit is kept and said. */
  overwriteDrift?: boolean;
  /** Names a dry run counts as present because an earlier step would create them. A real run refuses it. */
  pending?: Pending;
  /** The libraries the file declares, whose names resolve through the lock: a blueprint's `library` lines. None for a component or artboard file alone. */
  libraries?: string[];
  /**
   * Leave unread a set or an artboard whose stamp holds the fingerprint of what this run would write for it: trusted,
   * so a change made by hand in it is not looked for. Without it every one is read and compared.
   */
  skipUnchanged?: boolean;
}

/**
 * One thing the engine will do, or the reason it will not, or something it found
 * and left alone.
 *
 * A step is data: the diff makes them without touching Figma, and a dry run
 * returns them as they are. Steps that name a node carry its id from the
 * snapshot; steps that name a layer of a member carry its address, since a layer
 * the same run creates has no id yet.
 */
export type Step =
  | { kind: 'CREATE_SET'; component: SetSpec; members: Member[] }
  /** An artboard that does not exist yet: its frame and everything in it, built in one go. */
  | { kind: 'CREATE_ARTBOARD'; member: Member }
  /** A set of the component's name that Toghen did not make. It is never adopted by name. */
  | { kind: 'REFUSE_FOREIGN'; component: string; nodeIds: string[]; message: string }

  // Properties, on the set.
  | { kind: 'ADD_PROPERTY'; property: Property }
  /** `changes` names what differs: `defaultValue`, `description`, `preferredValues`, `slotSettings`. */
  | { kind: 'EDIT_PROPERTY'; property: Property; changes: string[] }
  | { kind: 'DELETE_PROPERTY'; name: string; breaks?: string }

  // Members.
  /** An axis the file renamed and nothing else about the axes: every member keeps its node and its stamp is written again. Breaks nothing. */
  | { kind: 'RENAME_AXIS'; from: string; to: string }
  | { kind: 'CREATE_MEMBER'; member: Member }
  /** `strip`: the ids of the person's copies of the member and of what is in it, whose stamps the deletion strips (decisions, *A copy whose original Toghen removes*); `breaks` then names them. Each deletion below carries it the same way. */
  | { kind: 'DELETE_MEMBER'; memberId: string; name: string; breaks: string; strip?: string[] }

  // Layers of a member that exists. `layer` never carries children: they are steps of their own.
  | { kind: 'CREATE_LAYER'; member: string; memberId: string; layer: Layer; parent: string; after?: string }
  | {
      kind: 'REPLACE_LAYER';
      member: string;
      memberId: string;
      nodeId: string;
      layer: Layer;
      parent: string;
      after?: string;
      breaks: string;
      strip?: string[];
    }
  | { kind: 'MOVE_LAYER'; member: string; memberId: string; nodeId: string; address: string; parent: string; after?: string }
  /** Writes `fields`, those of the layer's fields its receipt says to write (`diff.ts`, `patch`), names the layer for the file and stamps it. The root layer is the member itself: `nodeId` is `memberId`. `restamp` names fields Figma already holds the file's value in, though not their receipt's: their receipt is taken again, and nothing is written. */
  | { kind: 'PATCH_LAYER'; member: string; memberId: string; nodeId: string; layer: Layer; fields: string[]; restamp?: string[] }
  /**
   * An instance whose component the locator now answers with another one (the lock sent its name to another key, or the
   * file names another): swapped with `swapComponent`, one row per instance. `component` is the set or artboard the
   * instance is in; `from` names the component the instance shows now, `fromLibrary` the library it came from (its
   * name as the lock holds its key, or empty when the lock holds it under none; absent: this file); `to` names the one
   * it will show, and `library` the declared library the locator took it from (absent: this file).
   */
  | {
      kind: 'SWAP_COMPONENT';
      member: string;
      memberId: string;
      nodeId: string;
      address: string;
      component: string;
      from: string;
      fromLibrary?: string;
      to: string;
      library?: string;
    }
  /** `breaks` is set for an artboard, where a layer the file stopped producing is removed with whatever a person put in it. Where it is not, `message` names the copies it strips. */
  | {
      kind: 'DELETE_LAYER';
      member: string;
      memberId: string;
      nodeId: string;
      address: string;
      breaks?: string;
      strip?: string[];
      message?: string;
    }
  /** A field someone changed by hand since Toghen wrote it, which `overwriteDrift` writes again: said before the patch that does it. */
  | { kind: 'OVERWRITE'; member: string; address: string; message: string }

  /**
   * A member outside any set, left by an earlier run or dragged out of its set. Found once per run, on every page, and
   * always breaking: its instances may be in other files that use this one as a library.
   */
  | { kind: 'REMOVE_STRAY'; id: string; name: string; breaks: string }

  /** Something found and left alone, reported. A `copy` is a node a person copied from one of Toghen's, which carries its stamp. */
  | { kind: 'LEAVE'; what: 'unstamped-node' | 'unstamped-member' | 'field' | 'property' | 'drift' | 'copy'; message: string }
  /** Re-lays the members out and resizes the set. */
  | { kind: 'RELAYOUT' };

export interface Report {
  /** An artboard run: `created`, `updated` and `deleted` then name layers, not members. */
  artboard?: true;
  dryRun: boolean;
  /** The steps planned, and for a real run the ones applied. */
  steps: Step[];
  /** The set built or patched. Absent for a dry run and for a refusal. */
  setId?: string;
  /** Names of the members created, in the order they were made. */
  created: string[];
  /** Names of the members whose layers were patched. */
  updated: string[];
  /** Names of the members deleted. */
  deleted: string[];
  /** What was found and left alone: nodes with no stamp, fields no longer declared, fields edited by hand (drift), foreign properties. */
  notes: string[];
  /** What breaks instances elsewhere: a member deleted, a layer replaced, a property deleted. */
  breaking: string[];
  /** Things the engine noticed that did not stop it. */
  warnings: string[];
  /** How many fields were kept as hand edits (`LEAVE` drift), when any: the summary line counts them. */
  drifted?: number;
  /** Names a dry run counted as present because `pending` said an earlier step would create them. Empty for a real run. */
  pending: string[];
  /** Left unread by `skipUnchanged`: its stamp holds the fingerprint of what the run would write. No step was planned. */
  unchanged?: true;
}

/** One step as the plugin reports it: what it did and to what, without the layer it carried. */
export interface StepSummary {
  kind: Step['kind'];
  member?: string;
  address?: string;
  property?: string;
  /** A renamed axis. */
  from?: string;
  to?: string;
  changes?: string[];
  members?: number;
  /** A new artboard: how many layers it makes, its frame included, as the run would count them created. */
  layers?: number;
  message?: string;
  breaks?: string;
}

/** The report the plugin sends: the full one, with each step summarised (a step carries its whole layer, which the screen and the terminal do not need). */
export type CompactReport = Omit<Report, 'steps'> & { steps: StepSummary[] };
