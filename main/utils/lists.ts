/** `flatMap`, which the sandbox's ES2017 library lacks. */
export function flatMap<T, U>(items: readonly T[], map: (item: T) => U[]): U[] {
  return ([] as U[]).concat(...items.map(map));
}
