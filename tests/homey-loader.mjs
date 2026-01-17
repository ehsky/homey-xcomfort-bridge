import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

const runtimePath = pathResolve(
  fileURLToPath(new URL('.', import.meta.url)),
  'homey-runtime.mjs'
);
const runtimeUrl = pathToFileURL(runtimePath).href;

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'homey') {
    return { url: runtimeUrl, shortCircuit: true };
  }

  return defaultResolve(specifier, context, defaultResolve);
}
