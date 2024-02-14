export const PLUGIN_NAME = 'stylex';
export const VIRTUAL_CSS_PATH = require.resolve('./stylex.virtual.css');
export const VIRTUAL_CSS_PATTERN = /stylex\.virtual\.css/;

// Webpack does not export these constants
// https://github.com/webpack/webpack/blob/b67626c7b4ffed8737d195b27c8cea1e68d58134/lib/OptimizationStages.js#L8
export const OPTIMIZE_CHUNKS_STAGE_ADVANCED = 10;

import type webpack from 'webpack';
import type { RegisterStyleXRules } from '.';

export type SupplementedLoaderContext<Options = unknown> = webpack.LoaderContext<Options> & {
  StyleXWebpackContextKey: {
    registerStyleXRules: RegisterStyleXRules
  }
};

export const isSupplementedLoaderContext = <T>(context: webpack.LoaderContext<T>): context is SupplementedLoaderContext<T> => {
  // eslint-disable-next-line prefer-object-has-own -- target older
  return Object.prototype.hasOwnProperty.call(context, 'StyleXWebpackContextKey');
};
