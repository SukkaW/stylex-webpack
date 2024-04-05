import type webpack from 'webpack';

// prefer loader-utils over self-implemented hash function to utilize caching + bulk hashing
import { getHashDigest } from 'loader-utils';

export default function (this: webpack.LoaderContext<unknown>, inputCode: string, inputSourceMap: any) {
  const callback = this.async();
  const data = new URLSearchParams(this.resourceQuery.slice(1));

  try {
    const stylex = data.get('stylex');
    if (stylex == null) {
      callback(null, inputCode, inputSourceMap);
      return;
    }

    // If we got stylex in the virtual css import, we need to disable the cache
    // to fix HMR and Next.js navigation
    this.cacheable(false);

    // @ts-expect-error -- getHashDigest supports string & xxhash64
    const hash = getHashDigest(stylex, 'xxhash64', 'base62', 32);

    const css = `
    /*
     * dummy css generated by stylex-webpack
     * real css will be injected later directly to the module
     *
     * stylex rules: ${stylex}
     */
    .__stylex_dummy_${hash} {}`;

    callback(null, css);
  } catch (e) {
    callback(e as Error);
  }
}
