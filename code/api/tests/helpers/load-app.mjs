import { build } from '../../../node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';

export async function loadModule(relativePath) {
  const entry = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
