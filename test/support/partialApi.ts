/**
 * The type-safety mechanism behind the Figma mock.
 *
 * ### The problem it solves
 *
 * Every mock in this suite used to be written as `{...} as unknown as PluginAPI`.
 * The double assertion switches off structural checking entirely, so a mock
 * could define a method the real API does not have and nothing would object.
 * That is exactly what happened: five test files mocked `figma.loadPageAsync`,
 * a method the Plugin API has never had, and the suite reported the code that
 * called it as working.
 *
 * ### How this fixes it
 *
 * `impl` is a fresh object literal contextually typed as `Partial<T>`, which
 * triggers TypeScript's excess-property check. Writing a member the real API
 * lacks is a compile error:
 *
 * ```
 * Object literal may only specify known properties,
 * and 'loadPageAsync' does not exist in type 'Partial<PluginAPI>'.
 * ```
 *
 * The single `as T` is a legal narrowing — `T` is assignable to `Partial<T>` —
 * so `as unknown` appears nowhere.
 *
 * Anything left unimplemented throws by name rather than surfacing as
 * `undefined is not a function`, so a gap in the mock is never mistaken for a
 * code path that legitimately does nothing.
 *
 * @param name - Dotted name used in error messages, e.g. `'figma.variables'`
 * @param impl - The subset of `T` this mock implements
 * @returns `impl`, typed as the full API
 */
/**
 * A recursively-partial view of an API surface.
 *
 * Functions keep their **exact** signatures, so a stub with the wrong shape is
 * still a compile error — that is what catches `{ id }` being passed where a
 * `VariableAlias` (`{ type, id }`) is required. Nested API objects recurse, so a
 * fixture may implement `variables.createVariable` without implementing the
 * other forty members of `VariablesAPI`.
 *
 * Excess-property checking still applies at every level, which is the property
 * that matters: a member the real API does not have cannot be written.
 */
export type DeepPartialApi<T> = {
  [K in keyof T]?: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => PartialReturn<R>
    : T[K] extends object
      ? DeepPartialApi<T[K]>
      : T[K];
};

/**
 * What a mocked method is allowed to return.
 *
 * **Arguments stay exact** — that is what rejects a stub whose parameters are
 * the wrong shape. Return *values* are relaxed, because a fixture standing in
 * for a `Variable` legitimately carries the three fields the test needs rather
 * than all thirty. Requiring complete objects would force every fixture to
 * fabricate API surface it never exercises, which is how mocks start lying.
 *
 * The real `R` is allowed as well as its partial view. Under
 * `@figma/plugin-typings` 1.139 the node types are cyclic enough (a `SliceNode`
 * reaches every `SceneNode` through `getTopLevelFrame().findChildren()`) that
 * TypeScript could no longer prove a real `SceneNode` assignable to
 * `DeepPartialApi<SceneNode>`, which refused every fixture that hands the mock a
 * whole node. A whole node is always a legitimate return.
 */
type PartialReturn<R> = R | (R extends Promise<infer U> ? Promise<PartialValue<U>> : PartialValue<R>);

type PartialValue<V> = V extends readonly (infer E)[]
  ? Array<E extends object ? DeepPartialApi<E> : E>
  : V extends object
    ? DeepPartialApi<V>
    : V;

/**
 * Installs a partial Figma API as `globalThis.figma`.
 *
 * For fixtures that predate {@link createFigmaMock} and are hand-shaped for one
 * test. The value over the old `as unknown as PluginAPI` is that the argument is
 * contextually typed, so excess-property checking rejects any member Figma does
 * not have — the check that would have caught `loadPageAsync` in five files.
 *
 * Prefer `createFigmaMock()` for new tests: it also reproduces Figma's *failure*
 * behaviour, which types cannot express.
 */
export function installFigma(impl: DeepPartialApi<PluginAPI>): void {
  (globalThis as { figma?: PluginAPI }).figma = impl as PluginAPI;
}

export function partialApi<T extends object>(name: string, impl: Partial<T>): T {
  return new Proxy(impl, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      // Symbols are probed by util.inspect, await, and assertion libraries.
      // Throwing for those would break tooling rather than reveal a gap.
      if (typeof prop === 'symbol') {
        return undefined;
      }
      throw new Error(
        `${name}.${String(prop)} is not implemented in the Figma mock. ` +
          `Add it to the mock if the code under test legitimately needs it.`,
      );
    },
  }) as T;
}
