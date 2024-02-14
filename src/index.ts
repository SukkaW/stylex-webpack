import type webpack from 'webpack';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Rule as StyleXRule, Options as StyleXOptions } from '@stylexjs/babel-plugin';
import path from 'path';
import type { StyleXLoaderOptions } from './stylex-loader';
import { PLUGIN_NAME, VIRTUAL_CSS_PATH, VIRTUAL_CSS_PATTERN } from './constants';
import { StyleXWebpackContextKey, type SupplementedLoaderContext } from './constants';

const stylexLoaderPath = require.resolve('./stylex-loader');

export interface StyleXPluginOption {
  stylexOption?: Partial<StyleXOptions>,
  /**
   * Specify where to inject the StyleX generated CSS
   *
   * @default (filename) => filename.endsWith('stylex.css')
   */
  appendTo?: (assetPath: string) => boolean,
  /**
   * Specify where stylex will be imported from
   *
   * @default ['stylex', '@stylexjs/stylex']
   */
  stylexImports?: string[],
  /**
   * Whether to use CSS layers
   *
   * @default false
   */
  useCSSLayers?: boolean,
  /**
   * Enable stylex's unstable_moduleResolution and specify rootDir
   */
  rootDir?: string,
  /**
   * Supplement custom MiniCssExtractPlugin loaderpath
   */
  miniCssExtractPluginLoader?: string
}

const getStyleXRules = (stylexRules: Map<string, readonly StyleXRule[]>, useCSSLayers: boolean) => {
  if (stylexRules.size === 0) {
    return null;
  }
  // Take styles for the modules that were included in the last compilation.
  const allRules: StyleXRule[] = Array.from(stylexRules.values()).flat();

  return stylexBabelPlugin.processStylexRules(
    allRules,
    useCSSLayers
  );
};

export type RegisterStyleXRules = (resourcePath: string, stylexRules: StyleXRule[]) => void;

export class StyleXPlugin {
  static stylexLoader = stylexLoaderPath;

  stylexRules = new Map<string, readonly StyleXRule[]>();
  readonly stylexImports: string[] = [];

  appendTo: (assetPath: string) => boolean;
  useCSSLayers: boolean;
  stylexOption: Partial<StyleXOptions>;

  constructor({
    appendTo = (filename) => filename.endsWith('stylex.css'),
    stylexImports = ['stylex', '@stylexjs/stylex'],
    useCSSLayers = false,
    stylexOption = {
      dev: process.env.NODE_ENV === 'development',
      useRemForFontSize: true,
      runtimeInjection: false,
      genConditionalClasses: true,
      treeshakeCompensation: true,
      importSources: stylexImports
    }
  }: StyleXPluginOption = {}) {
    this.appendTo = appendTo;
    this.useCSSLayers = useCSSLayers;
    this.stylexOption = stylexOption;
    this.stylexImports = stylexImports;
  }

  apply(compiler: webpack.Compiler) {
    // If splitChunk is enabled, we create a dedicated chunk for stylex css
    if (!compiler.options.optimization.splitChunks) {
      throw new Error(
        [
          'You don\'t have "optimization.splitChunks" enabled.',
          '"optimization.splitChunks" should be enabled for "stylex-webpack" to function properly.'
        ].join(' ')
      );
    }

    compiler.options.optimization.splitChunks.cacheGroups ??= {};
    compiler.options.optimization.splitChunks.cacheGroups.stylex = {
      name: 'stylex',
      // Rspack does not support functions in test due performance concerns
      // https://github.com/web-infra-dev/rspack/issues/3425#issuecomment-1577890202
      test: VIRTUAL_CSS_PATTERN,
      chunks: 'all',
      enforce: true
    };

    // const IS_RSPACK = Object.prototype.hasOwnProperty.call(compiler.webpack, 'rspackVersion');

    // stylex-loader adds virtual css import (which triggers virtual-loader)
    // This prevents "stylex.virtual.css" files from being tree shaken by forcing
    // "sideEffects" setting.
    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, nmf => {
      nmf.hooks.createModule.tap(
        PLUGIN_NAME,
        (createData) => {
          const modPath: string | undefined = createData.matchResource ?? createData.resourceResolveData?.path;
          if (modPath === VIRTUAL_CSS_PATH) {
            createData.settings ??= {};
            createData.settings.sideEffects = true;
          }
        }
      );
    });

    const { Compilation, NormalModule, sources } = compiler.webpack;
    const { ConcatSource, RawSource } = sources;

    // Apply loader to JS modules
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      NormalModule.getCompilationHooks(compilation).loader.tap(
        PLUGIN_NAME,
        (loaderContext, mod) => {
          const extname = path.extname(mod.resource);

          if (
            // JavaScript (and Flow) modules
            /\.jsx?/.test(extname)
            // TypeScript modules
            || /\.tsx?/.test(extname)
          ) {
            (loaderContext as SupplementedLoaderContext)[StyleXWebpackContextKey] = {
              registerStyleXRules: (resourcePath, stylexRules) => {
                this.stylexRules.set(resourcePath, stylexRules);
              }
            };

            // We use .push() here instead of .unshift()
            // Webpack usually runs loaders in reverse order and we want to ideally run
            // our loader before anything else.
            mod.loaders.push({
              loader: stylexLoaderPath,
              options: {
                stylexImports: this.stylexImports,
                stylexOption: this.stylexOption
              } satisfies StyleXLoaderOptions,
              ident: null,
              type: null
            });
          }
        }
      );

      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
        },
        (assets) => {
          const cssFileName = Object.keys(assets).find(this.appendTo);
          if (cssFileName) {
            const cssAsset = assets[cssFileName];
            const stylexCSS = getStyleXRules(this.stylexRules, this.useCSSLayers);
            if (stylexCSS != null) {
              assets[cssFileName] = new ConcatSource(
                cssAsset,
                new RawSource(stylexCSS)
              );
            }
          }
        }
      );
    });
  }
}
