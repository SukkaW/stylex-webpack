import { version as packageVersion } from '../package.json';

import type { Rule as StyleXRule, Options as StyleXOptions } from '@stylexjs/babel-plugin';
import type * as webpack from 'webpack';
import type { StyleXLoaderOptions } from './stylex-loader';
import type { SupplementedLoaderContext } from './constants';
import type { Buffer } from 'node:buffer';

import { FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME, INCLUDE_REGEXP, PLUGIN_NAME, STYLEX_CHUNK_NAME, VIRTUAL_ENTRYPOINT_CSS_PATH, VIRTUAL_ENTRYPOINT_CSS_PATTERN, FUCK_NEXTJS_VIRTUAL_CARRIER_PATTERN } from './constants';

import stylexBabelPlugin from '@stylexjs/babel-plugin';
import path from 'node:path';
import process from 'node:process';
import type { CssModule } from 'mini-css-extract-plugin';

import VirtualModulesPlugin from 'webpack-virtual-modules';
import { identity } from 'foxts/identity';

const stylexLoaderPath = require.resolve('./stylex-loader');
const fuckNextjsVirtualLoaderPath = require.resolve('./stylex-fuck-nextjs-virtual-carrier-loader');

type CSSTransformer = (css: string) => string | Buffer | Promise<string | Buffer>;
export interface StyleXPluginOption {
  /**
   * stylex options passed to stylex babel plugin
   *
   * @see https://stylexjs.com/docs/api/configuration/babel-plugin/
   */
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

function getStyleXRules(stylexRules: Map<string, readonly StyleXRule[]>, useCSSLayers: boolean) {
  if (stylexRules.size === 0) {
    return null;
  }
  // Take styles for the modules that were included in the last compilation.
  const allRules: StyleXRule[] = Array.from(stylexRules.values()).flat();

  return stylexBabelPlugin.processStylexRules(
    allRules,
    useCSSLayers
  );
}

export type RegisterStyleXRules = (resourcePath: string, stylexRules: StyleXRule[]) => void;

export class StyleXPlugin {
  stylexRules = new Map<string, readonly StyleXRule[]>();
  useCSSLayers: boolean;

  loaderOption: StyleXLoaderOptions;

  transformCss: CSSTransformer;

  private readonly _virtualModuleInstance = new VirtualModulesPlugin();

  constructor({
    stylexImports = ['stylex', '@stylexjs/stylex'],
    useCSSLayers = false,
    stylexOption = {},
    nextjsMode = false,
    transformCss = identity satisfies CSSTransformer
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

    this._virtualModuleInstance.apply(compiler);

    compiler.options.optimization.splitChunks.cacheGroups ??= {};
    compiler.options.optimization.splitChunks.cacheGroups[STYLEX_CHUNK_NAME] = {
      name: STYLEX_CHUNK_NAME,
      test: VIRTUAL_ENTRYPOINT_CSS_PATTERN,
      type: 'css/mini-extract',
      chunks: 'all',
      enforce: true
    };

    if (this.loaderOption.nextjsMode) {
      compiler.options.optimization.splitChunks.cacheGroups[FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME] = {
        name: FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME,
        test: FUCK_NEXTJS_VIRTUAL_CARRIER_PATTERN,
        type: 'css/mini-extract',
        chunks: 'all',
        enforce: true
      };
    }

    // const IS_RSPACK = Object.prototype.hasOwnProperty.call(compiler.webpack, 'rspackVersion');

    // stylex-loader adds virtual css import (which triggers virtual-loader)
    // This prevents "stylex.virtual.css" files from being tree shaken by forcing
    // "sideEffects" setting.
    // TODO-RSPACK: rspack does support normalModuleFactory, we need to test this out
    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, nmf => {
      nmf.hooks.createModule.tap(
        PLUGIN_NAME,
        (createData) => {
          const modPath: string | false | undefined = createData.matchResource ?? createData.resourceResolveData?.path;
          if (modPath === VIRTUAL_ENTRYPOINT_CSS_PATH) {
            createData.settings ??= {};
            createData.settings.sideEffects = true;
          }
        }
      );
    });

    const { Compilation, NormalModule, sources } = compiler.webpack;
    const { RawSource } = sources;

    const meta = JSON.stringify({
      name: 'stylex-webpack',
      packageVersion,
      opt: this.loaderOption
    });

    // Apply loader to JS modules
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.chunkHash.tap(
        PLUGIN_NAME,
        (_, hash) => hash.update(meta)
      );

      NormalModule.getCompilationHooks(compilation).loader.tap(
        PLUGIN_NAME,
        (loaderContext, mod) => {
          const extname = path.extname(mod.matchResource || mod.resource);

          if (this.loaderOption.nextjsMode && FUCK_NEXTJS_VIRTUAL_CARRIER_PATTERN.test(mod.matchResource || mod.resource)) {
            mod.loaders.push({
              loader: fuckNextjsVirtualLoaderPath,
              options: {},
              ident: null,
              type: null
            });
          }

          if (INCLUDE_REGEXP.test(extname)) {
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
        }
      );

      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
        },
        async (assets) => {
          if (this.loaderOption.nextjsMode) {
            // Collect stylex rules from module instead of self maintained map
            // on previous step, we create a "stylex" chunk to hold all virtual stylex css
            // the chunk contains all css chunks generated by mini-css-extract-plugin
            // TODO-RSPACK: once again, rspack doesn't have this
            const fuckNextjsChunk = compilation.namedChunks.get(FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME);

            if (fuckNextjsChunk) {
              const cssModulesInFuckNextjsChunk = compilation.chunkGraph.getChunkModulesIterableBySourceType(fuckNextjsChunk, 'css/mini-extract');

              // we only re-collect stylex rules if we can found css in the stylex chunk
              if (cssModulesInFuckNextjsChunk) {
                for (const cssModule of (cssModulesInFuckNextjsChunk as Iterable<CssModule>)) {
                  if (!('_identifier' in cssModule) || typeof cssModule._identifier !== 'string') {
                    continue;
                  }

                  const stringifiedStylexRule = cssModule._identifier.split('!').pop()?.split('?').pop();
                  if (!stringifiedStylexRule) {
                    continue;
                  }

                  const params = new URLSearchParams(stringifiedStylexRule);
                  const stylex = params.get('stylex');
                  const from = params.get('from');
                  if (stylex != null && from != null) {
                    this.stylexRules.set(from, JSON.parse(stylex));
                  }
                }
              }

              // Let's find the css file that belongs to the fuck-next.js chunk to remove it
              const fuckNextjsChunkCssAssetNames = Object.keys(assets).filter((assetName) => fuckNextjsChunk.files.has(assetName) && assetName.endsWith('.css'));

              if (fuckNextjsChunkCssAssetNames.length > 0) {
                for (const assetName of fuckNextjsChunkCssAssetNames) {
                  compilation.deleteAsset(assetName);
                }
              }
            }
          }

          const stylexCSS = getStyleXRules(this.stylexRules, this.useCSSLayers);

          if (stylexCSS == null) {
            return;
          }

          const finalCss = await this.transformCss(stylexCSS);

          if (compiler.options.mode === 'development') {
            // In development mode, a.k.a. HMR
            /**
             * Now we write final CSS to virtual module, which acts like `stylex-webpack/stylex.css` has been
             * updated locally on the disk, and Next.js and webpack will have no choice but to update the global css
             */
            this._virtualModuleInstance.writeModule(VIRTUAL_ENTRYPOINT_CSS_PATH, finalCss.toString());
          } else {
            const stylexChunk = compilation.namedChunks.get(STYLEX_CHUNK_NAME);

            if (!stylexChunk) return;

            // Let's find the css file that belongs to the stylex chunk
            const stylexChunkCssAssetNames = Object.keys(assets).filter((assetName) => stylexChunk.files.has(assetName) && assetName.endsWith('.css'));

            if (stylexChunkCssAssetNames.length === 0) {
              return;
            }
            if (stylexChunkCssAssetNames.length > 1) {
              console.warn('[stylex-webpack] Multiple CSS assets found for the stylex chunk. This should not happen. Please report this issue.');
            }

            const stylexAssetName = stylexChunkCssAssetNames[0];

            compilation.updateAsset(
              stylexAssetName,
              () => new RawSource(finalCss),
              { minimized: false }
            );
          }
        }
      );
    });
  }
}
