export const PLUGIN_NAME = 'stylex';
export const VIRTUAL_ENTRYPOINT_CSS_PATH: string = require.resolve('./stylex.css');
export const VIRTUAL_ENTRYPOINT_CSS_PATTERN = /stylex\.css/;
export const STYLEX_CHUNK_NAME = '_stylex-webpack-generated';

export const FUCK_NEXTJS_VIRTUAL_CARRIER_PATH: string = require.resolve('./stylex.fuck-nextjs.virtual-carrier.js');
export const FUCK_NEXTJS_VIRTUAL_CARRIER_PATTERN = /stylex\.fuck-nextjs\.virtual-carrier\.js/;
export const FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME = '_stylex-fuck-nextjs-collect-stylex-rules';

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
