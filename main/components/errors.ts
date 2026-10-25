/**
 * The one way the component engine stops.
 *
 * A script that throws is rolled back entirely by Figma, which is the guarantee
 * the design leans on: a set is changed whole or not at all. So a name that does
 * not resolve, and a set that must not be touched, are thrown, and thrown with
 * every reason at once so one run is enough to fix a file.
 */
export class ComponentRunError extends Error {
  readonly problems: string[];

  constructor(headline: string, problems: string[]) {
    super(`${headline}\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ComponentRunError';
    this.problems = problems;
  }
}
