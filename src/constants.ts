export const PLUGIN_NAME = 'stylex';
export const VIRTUAL_CSS_PATH = require.resolve('./stylex.virtual.css');
export const VIRTUAL_CSS_PATTERN = /stylex\.virtual\.css/;

import type webpack from 'webpack';
import type { RegisterStyleXRules } from '.';

export const StyleXWebpackContextKey = Symbol(`${PLUGIN_NAME}/StyleXLoaderContextKey`);

export type SupplementedLoaderContext<Options = unknown> = webpack.LoaderContext<Options> & {
  [StyleXWebpackContextKey]?: {
    registerStyleXRules: RegisterStyleXRules
  }
};

export const isSupplementedLoaderContext = <T>(context: webpack.LoaderContext<T>): context is SupplementedLoaderContext<T> => {
  return StyleXWebpackContextKey in context;
};
