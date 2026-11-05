import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[a-z]+$/.test(spec) && ctx.parentURL) {
    const base = new URL(spec, ctx.parentURL);
    for (const ext of ['.js', '.mjs']) { const p = fileURLToPath(base) + ext; if (existsSync(p)) return next(base.href + ext, ctx); }
  }
  return next(spec, ctx);
}
