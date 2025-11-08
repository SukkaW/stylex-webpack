export const PLUGIN_NAME = 'stylex';

export const LOADER_TRANSFORMED_FLAG = '/* [stylex-webpack] stylex-loader transformed */';

export const VIRTUAL_ENTRYPOINT_CSS_PATH: string = require.resolve('./stylex.css');
export const VIRTUAL_STYLEX_CSS_DUMMY_IMPORT_PATH: string = require.resolve('./stylex-virtual.css');

export const VIRTUAL_CSS_PATTERN = /stylex\.css|stylex-virtual\.css/;
export const VIRTUAL_STYLEX_CSS_DUMMY_IMPORT_PATTERN = /stylex-virtual\.css/;

export const STYLEX_CHUNK_NAME = '_stylex-webpack-generated';

export const INCLUDE_REGEXP = /\.[cm]?[jt]sx?$/;

export const BUILD_INFO_STYLEX_KEY = '~stylex_webpack_stylex_rules';

// https://github.com/vercel/next.js/blob/ad6907a8a37e930639af071203f4ce49a5d69ee5/packages/next/src/shared/lib/constants.ts#L7
export const NEXTJS_COMPILER_NAMES = {
  client: 'client',
  server: 'server',
  edgeServer: 'edge-server'
} as const;

export type NextJsCompilerName = (typeof NEXTJS_COMPILER_NAMES)[keyof typeof NEXTJS_COMPILER_NAMES];

export function isNextJsCompilerName(name: string | undefined): name is NextJsCompilerName {
  if (name == null) return false;
  return NEXTJS_COMPILER_NAMES[name as keyof typeof NEXTJS_COMPILER_NAMES] === name;
}
