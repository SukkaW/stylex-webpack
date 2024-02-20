import type webpack from 'webpack';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Rule as StyleXRule, Options as StyleXOptions } from '@stylexjs/babel-plugin';
import path from 'path';
import type { StyleXLoaderOptions } from './stylex-loader';
import { PLUGIN_NAME, STYLEX_CHUNK_NAME, VIRTUAL_CSS_PATH, VIRTUAL_CSS_PATTERN } from './constants';
import type { SupplementedLoaderContext } from './constants';
import type { CssModule } from 'mini-css-extract-plugin';

const stylexLoaderPath = require.resolve('./stylex-loader');
const stylexVirtualLoaderPath = require.resolve('./stylex-virtual-css-loader');

type CSSTransformer = (css: string) => string | Buffer | Promise<string | Buffer>;
export interface StyleXPluginOption {
  stylexOption?: Partial<StyleXOptions>,
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
   * Next.js Mode
   *
   * @default false
   */
  nextjsMode?: boolean,

  /**
   * Enable other CSS transformation
   *
   * Since stylex-webpack only inject CSS after all loaders, you can not use postcss-loader.
   * With this you can incovate `postcss()` here.
   */
  transformCss?: CSSTransformer
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

const identityTransfrom: CSSTransformer = css => css;

export type RegisterStyleXRules = (resourcePath: string, stylexRules: StyleXRule[]) => void;

export class StyleXPlugin {
  stylexRules = new Map<string, readonly StyleXRule[]>();
  useCSSLayers: boolean;

  loaderOption: StyleXLoaderOptions;

  transformCss: CSSTransformer;

  constructor({
    stylexImports = ['stylex', '@stylexjs/stylex'],
    useCSSLayers = false,
    stylexOption = {},
    nextjsMode = false,
    transformCss = identityTransfrom
  }: StyleXPluginOption = {}) {
    this.useCSSLayers = useCSSLayers;
    this.loaderOption = {
      stylexImports,
      stylexOption: {
        dev: process.env.NODE_ENV === 'development',
        useRemForFontSize: true,
        runtimeInjection: false,
        genConditionalClasses: true,
        treeshakeCompensation: true,
        importSources: stylexImports,
        ...stylexOption
      },
      nextjsMode
    };
    this.transformCss = transformCss;
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
    compiler.options.optimization.splitChunks.cacheGroups[STYLEX_CHUNK_NAME] = {
      name: STYLEX_CHUNK_NAME,
      test: VIRTUAL_CSS_PATTERN,
      type: 'css/mini-extract',
      chunks: 'all',
      enforce: true
    };

    // const IS_RSPACK = Object.prototype.hasOwnProperty.call(compiler.webpack, 'rspackVersion');

    // stylex-loader adds virtual css import (which triggers virtual-loader)
    // This prevents "stylex.virtual.css" files from being tree shaken by forcing
    // "sideEffects" setting.
    // TODO-RSPACK: rspack does support normalModuleFactory, we need to test this out
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
    const { RawSource, ConcatSource } = sources;

    // Apply loader to JS modules
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      NormalModule.getCompilationHooks(compilation).loader.tap(
        PLUGIN_NAME,
        (loaderContext, mod) => {
          const extname = path.extname(mod.matchResource || mod.resource);

          if (
            // JavaScript (and Flow) modules
            /\.jsx?/.test(extname)
            // TypeScript modules
            || /\.tsx?/.test(extname)
          ) {
            (loaderContext as SupplementedLoaderContext).StyleXWebpackContextKey = {
              registerStyleXRules: (resourcePath, stylexRules) => {
                this.stylexRules.set(resourcePath, stylexRules);
              }
            };

            // We use .push() here instead of .unshift()
            // Webpack usually runs loaders in reverse order and we want to ideally run
            // our loader before anything else.
            mod.loaders.push({
              loader: stylexLoaderPath,
              options: this.loaderOption,
              ident: null,
              type: null
            });
          }

          if (VIRTUAL_CSS_PATTERN.test(mod.matchResource || mod.resource)) {
            mod.loaders.push({
              loader: stylexVirtualLoaderPath,
              options: {},
              ident: null,
              type: null
            });
          }
        }
      );

      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
        },
        async (assets) => {
          // on previous step, we create a "stylex" chunk to hold all virtual stylex css
          // the chunk contains all css chunks generated by mini-css-extract-plugin
          // TODO-RSPACK: once again, rspack doesn't have this
          const stylexChunk = compilation.namedChunks.get(STYLEX_CHUNK_NAME);

          if (stylexChunk == null) {
            return;
          }

          // Collect stylex rules from module instead of self maintained map
          if (this.loaderOption.nextjsMode) {
            const cssModulesInStylexChunk = compilation.chunkGraph.getChunkModulesIterableBySourceType(stylexChunk, 'css/mini-extract');

            // we only re-collect stylex rules if we can found css in the stylex chunk
            if (cssModulesInStylexChunk) {
              this.stylexRules = new Map();

              for (const cssModule of (cssModulesInStylexChunk as Iterable<CssModule>)) {
                const stringifiedStylexRule = ((cssModule as any)._identifier as string).split('!').pop()?.split('?').pop();

                if (!stringifiedStylexRule) {
                  continue;
                }

                const params = new URLSearchParams(stringifiedStylexRule);
                const stylex = params.get('stylex');
                if (stylex != null) {
                  this.stylexRules.set(cssModule.identifier(), JSON.parse(stylex));
                }
              }
            }
          }

          // Let's find the css file that belongs to the stylex chunk
          const cssAssetDetails = Object.entries(assets).find(([assetName]) => stylexChunk.files.has(assetName));

          if (!cssAssetDetails) {
            return;
          }

          const stylexCSS = getStyleXRules(this.stylexRules, this.useCSSLayers);

          if (stylexCSS == null) {
            return;
          }

          const finalCss = await this.transformCss(stylexCSS);

          compilation.updateAsset(
            cssAssetDetails[0] /** cssFileName */,
            source => new ConcatSource(source, new RawSource(finalCss))
          );
        }
      );
    });
  }
}
