export const PLUGIN_NAME = 'stylex';
export const VIRTUAL_ENTRYPOINT_CSS_PATH: string = require.resolve('./stylex.css');
export const VIRTUAL_ENTRYPOINT_CSS_PATTERN = /stylex\.css/;
export const STYLEX_CHUNK_NAME = '_stylex-webpack-generated';

export const INCLUDE_REGEXP = /\.[cm]?[jt]sx?$/;
