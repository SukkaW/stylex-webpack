import { describe, it } from 'mocha';
import getWebpackCompiler from './utils/get-webpack-compiler';

import compile from './utils/compile';
import getModuleSource from './utils/get-module-source';
import { jestExpect as expect } from 'mocha-expect-snapshot';

([
  ['stylex-webpack (webpack)', getWebpackCompiler]
  // ['forgetti-loader (rspack)', getRspackCompiler]
] as const).forEach(([name, getCompiler]) => {
  describe(name, () => {
    it('should work', async () => {
      const [compiler, fs] = getCompiler('./simple.js');
      const stats = await compile(compiler);

      // const { chunks, modules } = stats.toJson({ source: true });

      expect(getModuleSource('./simple.js', stats, fs)).toMatchSnapshot('simple.js');
    });
  });
});
