// import type { rspack, Stats as RspackStats, MultiStats as RspackMultiStats } from '@rspack/core';
import type { Compiler as WebpackCompiler, Stats as WebpackStats } from 'webpack';

export default function compile(compiler: WebpackCompiler /* | ReturnType<typeof rspack> */): Promise<WebpackStats> {
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        return reject(error);
      }

      if (!stats) {
        return reject(new TypeError('stats from compiler is null'));
      }

      return resolve(stats);
    });
  });
}
