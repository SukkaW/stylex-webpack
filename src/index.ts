import { NormalModule, Compilation } from 'webpack';
import { createStyleXWebpackPlugin } from './create-webpack-plugin';

const PLUGIN_NAME = 'stylex';

export const StyleXWebpackPlugin = createStyleXWebpackPlugin({
  pluginName: PLUGIN_NAME,
  NormalModule,
  Compilation
});
