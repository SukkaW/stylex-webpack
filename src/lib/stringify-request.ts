import type { LoaderContext } from 'webpack';

export function stringifyRequest(loaderContext: LoaderContext<any>, request: string) {
  return JSON.stringify(loaderContext.utils.contextify(loaderContext.context || loaderContext.rootContext, request));
}
