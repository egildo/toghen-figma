/** A `LOAD_DOCUMENT` payload of one document's text, sent as the screen sends one picked file. */
export const oneFile = (text: string, path = 'test.resolver.json', extra: { dryRun?: boolean } = {}) => ({
  files: [{ path, text }],
  entry: path,
  ...extra,
});
