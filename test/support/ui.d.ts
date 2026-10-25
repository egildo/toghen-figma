/** `@toghen/ui` is plain JavaScript; its build is imported by the tests that read the stylesheet it writes. */
declare module '@toghen/ui/build.mjs' {
  /** The design system's stylesheet, built in memory, fonts included. */
  export function buildCss(): Promise<string>;
}
