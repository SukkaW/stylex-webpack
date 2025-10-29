import { defineConfig } from 'rollup';
import { swc } from 'rollup-plugin-swc3';
import { dts } from 'rollup-plugin-dts';
import copy from 'rollup-plugin-copy';
import json from '@rollup/plugin-json';

import pkgJson from './package.json';
import { builtinModules } from 'node:module';

const externalModules = Object.keys(pkgJson.dependencies)
  .concat(Object.keys(pkgJson.peerDependencies))
  .concat(builtinModules)
  .concat('next');
const external = (id: string) => id.startsWith('node:') || externalModules.some((name) => id === name || id.startsWith(`${name}/`));

export default defineConfig([{
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'commonjs'
  },
  plugins: [
    json(),
    swc(),
    copy({
      targets: [
        { src: 'src/stylex.css', dest: 'dist' }
      ]
    })
  ],
  external
}, {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.d.ts',
    format: 'commonjs'
  },
  external,
  plugins: [dts({
    respectExternal: false // has to be false otherwise rollup-plugin-dts will OOM and crash. The .d.ts looks OK after disable this
  })]
}, {
  input: 'src/stylex-loader.ts',
  output: {
    file: 'dist/stylex-loader.js',
    format: 'commonjs'
  },
  plugins: [swc()],
  external
}, {
  input: 'src/next.ts',
  output: {
    file: 'dist/next.js',
    format: 'commonjs'
  },
  plugins: [swc()],
  external(id: string) {
    const isExternal = external(id);
    if (isExternal) return true;
    return id === './index';
  }
}, {
  input: 'src/next.ts',
  output: {
    file: 'dist/next.d.ts',
    format: 'commonjs'
  },
  plugins: [dts({ respectExternal: true })],
  external(id: string) {
    const isExternal = external(id);
    if (isExternal) return true;
    return id === './index';
  }
}]);
