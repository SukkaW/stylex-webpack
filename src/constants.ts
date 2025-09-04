export const PLUGIN_NAME = 'stylex';
export const VIRTUAL_ENTRYPOINT_CSS_PATH: string = require.resolve('./stylex-entrypoint.css');
export const VIRTUAL_ENTRYPOINT_CSS_PATTERN = /stylex-entrypoint\.css/;
export const STYLEX_CHUNK_NAME = '_stylex-webpack-generated';

export const VIRTUAL_FUCK_NEXTJS_CSS_PATH: string = require.resolve('./stylex.fuck-nextjs.virtual.css');
export const VIRTUAL_FUCK_NEXTJS_CSS_PATTERN = /stylex\.fuck-nextjs\.virtual\.css/;
export const FUCK_NEXTJS_CHUNK_NAME = '_stylex-fuck-nextjs-collect-stylex-rules';

export const INCLUDE_REGEXP = /\.[cm]?[jt]sx?$/;

import type { LoaderContext } from 'webpack';
import type { RegisterStyleXRules } from '.';

export type SupplementedLoaderContext<Options = unknown> = LoaderContext<Options> & {
  StyleXWebpackContextKey: {
    registerStyleXRules: RegisterStyleXRules
  }
};

export function isSupplementedLoaderContext<T>(context: LoaderContext<T>): context is SupplementedLoaderContext<T> {
  // eslint-disable-next-line prefer-object-has-own -- target older
  return Object.prototype.hasOwnProperty.call(context, 'StyleXWebpackContextKey');
}
