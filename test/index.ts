import { describe, it } from 'mocha';
import * as chai from 'chai';
import { jestSnapshotPlugin } from 'mocha-chai-jest-snapshot';

import getWebpackCompiler from './utils/get-webpack-compiler';

import compile from './utils/compile';
// import getModuleSource from './utils/get-module-source';

chai.should();
chai.use(jestSnapshotPlugin());

([
  ['stylex-webpack (webpack)', getWebpackCompiler]
  // ['forgetti-loader (rspack)', getRspackCompiler]
] as const).forEach(([name, getCompiler]) => {
  describe(name, () => {
    it('should work', async () => {
      const [compiler, _fs] = getCompiler('./simple.js');
      const stats = await compile(compiler);

      const { chunks, modules } = stats.toJson({ source: true });

      console.log(chunks, modules);
      // getModuleSource('./simple.js', stats, fs)?.should.toMatchSnapshot('simple.js');
    });
  });
});
