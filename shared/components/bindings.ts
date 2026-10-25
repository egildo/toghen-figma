/**
 * Bindings inferred from a CSS-keyed group, laid over a member's evaluated layers.
 *
 * A layer that names a group (`tokens="{button}"`) gets the fields the group's keys imply, written
 * as if the file had said them, so every existing check applies to them. What each key implies was
 * worked out where the design system is (`groups.ts`, which holds the table) and travels on the
 * component as a `GroupPlan`; this runs in both runtimes, since only an evaluated layer knows which
 * fields a `when` already wrote, and those win. It is kept small on purpose: it is in every printed
 * script, whether or not the component names a group. It holds no Figma API and nothing from
 * `@toghen/lib`.
 */

import { planKey } from './axes.js';
import type { Component, FieldValue, Laid, Layer, Loc, Value } from './model.js';

/**
 * Infers the bindings of a member's layers and takes `tokens` off them: the engine is never
 * given a field that is not Figma's.
 *
 * The root gets the component line's group; a root that names a group of its own takes that one instead.
 *
 * `selection` is the part keys the member selects on the axes left in the path: a group has a plan of its own for it.
 *
 * `seen` is told what each layer got (the reader uses it to say what was skipped; the engine passes none).
 *
 * Written plainly on purpose (no `?.` or `??`, which the ES2017 build makes longer): the plugin
 * is built for ES2017.
 */
export function applyBindings(
  tree: Layer,
  component: Component,
  seen?: (layer: Layer, group: string, laid: Laid) => void,
  selection: Record<string, string> = {},
): void {
  const groups = component.groups || {};
  const visit = (layer: Layer, root: boolean): void => {
    const fields = layer.fields;
    const own = fields.tokens as { path: string } | undefined;
    delete fields.tokens;
    const group = (own ? own.path : root ? component.tokens : undefined) as string;
    // A group taken from an axis passes that on to the fields it infers, so a missing token can be said to come from it.
    const via = layer.fromAxes?.tokens;
    const plan = groups[planKey(group, selection)] || groups[group];
    if (plan) {
      // A text has its own part; a frame has one, and a gap adds a second that depends on its layout, which only the evaluated layer knows.
      const layout = fields.layoutMode ? ((fields.layoutMode as { value?: string }).value as 'NONE') : 'NONE';
      const locs = layer.fieldLoc as Record<string, Loc>;
      for (const laid of layer.kind === 'TEXT' ? [plan.TEXT] : [plan.box, plan[layout]]) {
        if (!laid) continue;
        // A field the layer has already, written on it or by a `when`, wins.
        for (const field of Object.keys(laid.set)) {
          if (field in fields) continue;
          const token = { kind: 'token', path: laid.set[field] } as Value;
          fields[field] = (field === 'fills' || field === 'strokes' ? [token] : token) as FieldValue;
          locs[field] = locs.tokens || (layer.loc as Loc);
          if (via) (layer.fromAxes as Record<string, string[]>)[field] = via;
        }
        if (seen) seen(layer, group, laid);
      }
    }
    for (const child of layer.children) visit(child, false);
  };
  visit(tree, true);
}
