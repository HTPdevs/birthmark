import { transformFileSync, transformSync } from '@babel/core';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// In development builds the Reanimated / worklets Babel plugin rewrites any
// `x.value` inside an inline `style` object into a console.warn("It looks like
// you might be using shared value's .value inside reanimated inline style"),
// even when x is a plain object. record.tsx did that with sinceTimerFonts()'s
// `value` font size. This compiles every component with the project's own
// babel.config.js and fails if the plugin injected the warning anywhere.

const ROOT = join(__dirname, '..');
const MARKER = 'getUseOfValueInStyleWarning';

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

const OPTIONS = { cwd: ROOT, envName: 'development', babelrc: false, configFile: join(ROOT, 'babel.config.js') };

/** Compiled output of a file, or of `code` as if it lived at `filename`. */
const compile = (filename: string, code?: string) =>
  (code === undefined ? transformFileSync(filename, OPTIONS) : transformSync(code, { ...OPTIONS, filename }))?.code ?? '';

describe('Reanimated inline style warning', () => {
  // Positive control: the old record.tsx line. If the plugin stops running in
  // this config, this fails instead of every file below passing vacuously.
  it('detects the pattern record.tsx used to have', () => {
    const record = join(ROOT, 'src', 'app', 'record.tsx');
    const old = readFileSync(record, 'utf8').replace('fontSize: sinceValueFont,', 'fontSize: fonts.value,');
    expect(old).toContain('fonts.value');
    expect(compile(record, old)).toContain(MARKER);
  });

  const files = tsxFiles(join(ROOT, 'src'));

  it.each(files.map((f) => [f.slice(ROOT.length + 1), f]))('%s compiles without the warning', (_, file) => {
    expect(compile(file)).not.toContain(MARKER);
  });
});
