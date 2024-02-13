import { NormalModule } from 'webpack';
import { createStyleXWebpackPlugin } from './create-webpack-plugin';

const PLUGIN_NAME = 'stylex';

const StyleXWebpackPlugin = createStyleXWebpackPlugin({
  NormalModule
});
