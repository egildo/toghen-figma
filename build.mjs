import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const isProduction = process.env.NODE_ENV === 'production';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

/**
 * The design system's stylesheet, built by `@toghen/ui` (`pnpm build` builds it
 * first): its tokens, its components and its fonts, as data URIs. The manifest
 * allows the window no network, so nothing is linked.
 */
const designSystemCss = () => readFileSync(fileURLToPath(import.meta.resolve('@toghen/ui/styles.css')), 'utf8');

async function buildOnce() {
  const uiResult = await esbuild.build({
    entryPoints: ['ui/main.js'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2017',
    minify: isProduction,
  });

  const uiJs = uiResult.outputFiles[0].text;
  const uiHtmlTemplate = readFileSync('ui/ui.html', 'utf8');
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

  // Functions as replacements, so a `$&` or `$'` inside the bundle is not read
  // as a replacement pattern.
  const finalHtml = uiHtmlTemplate
    // The design system's sheet first, the plugin's own after it: its rules come later and unlayered,
    // so they can adjust a component when they must.
    .replace(
      '<!-- INJECT_CSS -->',
      () => `<style>${designSystemCss()}</style>\n    <style>${readFileSync('ui/styles.css', 'utf8')}</style>`,
    )
    .replace('<!-- INJECT_JS -->', () => `<script>${uiJs}</script>`);

  writeFileSync('dist/ui.html', finalHtml, 'utf8');
  writeFileSync(
    'dist/manifest.json',
    `${JSON.stringify(
      {
        ...manifest,
        main: 'code.js',
        ui: 'ui.html',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await esbuild.build({
    entryPoints: ['main/code.ts'],
    bundle: true,
    outfile: 'dist/code.js',
    format: 'iife',
    target: 'es2017',
    platform: 'neutral',
    sourcemap: false,
    minify: isProduction,
    define: {
      __html__: JSON.stringify(finalHtml),
    },
  });
}

await buildOnce();
