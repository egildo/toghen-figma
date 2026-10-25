/**
 * Serves the preview page: the built plugin screen in an iframe, with switches
 * for theme and window size and buttons that post fixture messages into it.
 *
 * The page and its fixtures are how the screen is checked; there is no test
 * runner for the UI. Nothing here ships. Build first (`pnpm build`), then:
 *
 *   node scripts/preview.mjs            # http://localhost:4174
 *   PORT=5000 node scripts/preview.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 4174);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** Only these two folders are served: the build, and the preview page itself. */
const SERVED = [join(root, 'dist'), join(root, 'ui', 'dev')];

createServer(async (request, response) => {
  const requested = new URL(request.url ?? '/', 'http://localhost').pathname;
  // Redirected rather than served at `/`, so the page's relative imports resolve.
  if (requested === '/') {
    response.writeHead(302, { Location: '/ui/dev/preview.html' }).end();
    return;
  }
  const relative = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, relative);

  if (!SERVED.some((folder) => filePath.startsWith(folder))) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end(`Not found: ${requested}. Run pnpm build first.`);
  }
}).listen(port, () => {
  console.log(`Preview at http://localhost:${port}`);
});
