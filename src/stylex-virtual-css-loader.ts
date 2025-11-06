import type { LoaderContext } from 'webpack';

// prefer loader-utils over self-implemented hash function to utilize caching + bulk hashing
import { getHashDigest } from 'loader-utils';

export default function (this: LoaderContext<unknown>, inputCode: string, inputSourceMap: any) {
  const callback = this.async();
  this.cacheable(false);

  if (this._compiler?.options.mode === 'production') {
    // In development mode, we don't need to generate the virtual CSS content
    callback(null, inputCode, inputSourceMap);
    return;
  }

  const data = new URLSearchParams(this.resourceQuery.slice(1));

  try {
    const stylex = data.get('stylex');
    if (stylex == null) {
      callback(null, inputCode, inputSourceMap);
      return;
    }

    // @ts-expect-error -- getHashDigest supports string & xxhash64
    const hash = getHashDigest(stylex, 'xxhash64', 'base62', 32);

    const code = `/** stylex rules: ${stylex} */\n.stylex-hashed-${hash} {}`;

    callback(null, inputCode + '\n' + code);
  } catch (e) {
    callback(e as Error);
  }
}
