export const PLUGIN_NAME = 'stylex';
export const VIRTUAL_CSS_PATH = require.resolve('./stylex.virtual.css');
export const VIRTUAL_CSS_PATTERN = /stylex\.virtual\.css/;
export const STYLEX_CHUNK_NAME = '_stylex-webpack-generated';
export const INCLUDE_REGEXP = /\.[cm]?[jt]sx?$/;

import type webpack from 'webpack';
import type { RegisterStyleXRules } from '.';

export type SupplementedLoaderContext<Options = unknown> = webpack.LoaderContext<Options> & {
  StyleXWebpackContextKey: {
    registerStyleXRules: RegisterStyleXRules
  }
};

export function isSupplementedLoaderContext<T>(context: webpack.LoaderContext<T>): context is SupplementedLoaderContext<T> {
  // eslint-disable-next-line prefer-object-has-own -- target older
  return Object.prototype.hasOwnProperty.call(context, 'StyleXWebpackContextKey');
}
