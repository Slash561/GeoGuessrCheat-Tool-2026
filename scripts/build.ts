/**
 * Builds the extension into dist/:
 *   node scripts/build.ts          one-off build
 *   node scripts/build.ts --watch  rebuild on changes
 *
 * Type checking is done separately by `tsc` (see `npm run typecheck`), esbuild only bundles.
 */
import { rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { prepareCountries } from './prepare-countries.ts';

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });
await prepareCountries();

const options: esbuild.BuildOptions = {
    entryPoints: ['src/background.ts', 'src/companion.ts'],
    outdir: 'dist',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    charset: 'utf8',
    loader: { '.geodata': 'text' },
    logLevel: 'info',
};

if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
} else {
    await esbuild.build(options);
}
