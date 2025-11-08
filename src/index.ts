import { version as packageVersion } from '../package.json';

import type { Rule as StyleXRule, Options as StyleXOptions } from '@stylexjs/babel-plugin';
import type * as webpack from 'webpack';
import type { StyleXLoaderOptions } from './stylex-loader';
import type { Buffer } from 'node:buffer';

import { BUILD_INFO_STYLEX_KEY, INCLUDE_REGEXP, isNextJsCompilerName, NEXTJS_COMPILER_NAMES, PLUGIN_NAME, STYLEX_CHUNK_NAME, VIRTUAL_ENTRYPOINT_CSS_PATH, VIRTUAL_CSS_PATTERN, VIRTUAL_STYLEX_CSS_DUMMY_IMPORT_PATTERN } from './constants';
import type { NextJsCompilerName } from './constants';

import stylexBabelPlugin from '@stylexjs/babel-plugin';
import path from 'node:path';
import process from 'node:process';

import { identity } from 'foxts/identity';

declare namespace globalThis {
  // i really want to use a symbol here, but TypeScript won't let me :(
  let __stylex_nextjs_global_registry__: Map<NextJsCompilerName, Map<string, readonly StyleXRule[]>> | undefined;
}

const stylexLoaderPath = require.resolve('./stylex-loader');
const stylexVirtualCssLoaderPath = require.resolve('./stylex-virtual-css-loader');

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
   * Next.js App Router Mode
   *
   * @default false
   */
  nextjsAppRouterMode?: boolean,

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
    nextjsAppRouterMode = false,
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
      nextjsMode,
      nextjsAppRouterMode
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
          const modPath: string | false | undefined = createData.matchResource ?? createData.resourceResolveData?.path;
          if (modPath === VIRTUAL_ENTRYPOINT_CSS_PATH) {
            createData.settings ??= {};
            createData.settings.sideEffects = true;
          }
        }
      );
    });

    // compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
    //   compilation.dependencyTemplates.set(
    //     CssLocalIdentifierDependency,
    //     new CssLocalIdentifierDependency.Template()
    //   );
    // });

    const { Compilation, NormalModule, sources } = compiler.webpack;
    const { RawSource } = sources;

    const meta = JSON.stringify({
      name: 'stylex-webpack',
      packageVersion,
      opt: this.loaderOption
    });

    const logger = compiler.getInfrastructureLogger(PLUGIN_NAME);

    // Apply loader to JS modules
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.chunkHash.tap(
        PLUGIN_NAME,
        (_, hash) => hash.update(meta)
      );

      NormalModule.getCompilationHooks(compilation).loader.tap(
        PLUGIN_NAME,
        (_loaderContext, mod) => {
          const extname = path.extname(mod.matchResource || mod.resource);

          logger.debug(`attaching stylex-loader to ${mod.matchResource || mod.resource}`);

          if (INCLUDE_REGEXP.test(extname)) {
            // We use .push() here instead of .unshift()
            // Webpack usually runs loaders in reverse order and we want to ideally run
            // our loader before anything else.
            mod.loaders.push({
              loader: stylexLoaderPath,
              options: this.loaderOption,
              ident: null,
              type: null
            });
          } else if (VIRTUAL_STYLEX_CSS_DUMMY_IMPORT_PATTERN.test(mod.matchResource || mod.resource)) {
            mod.loaders.push({
              loader: stylexVirtualCssLoaderPath,
              ident: null,
              type: null
            });
          }
        }
      );

      /**
       * Next.js call webpack compiler through "runCompiler": https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/compiler.ts#L39
       *
       * The "runCompiler" funtion is invoked by "webpackBuildImpl" function: https://github.com/vercel/next.js/blob/ad6907a8a37e930639af071203f4ce49a5d69ee5/packages/next/src/build/webpack-build/impl.ts#L203
       *
       * The "webpackBuildImpl" function accepts "compilerName" parameter, and is invoked by "webpackBuild" function: https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/webpack-build/index.ts#L124
       * When build worker is enabled, the "compilerName" parameter is set to either "client", "server" or "edge-server". If build worker is disabled,
       * the "compilerName" parameter is always "null".
       *
       * When build worker is disabled, the multi-stage build is managed by "webpackBuildImpl" function itself: https://github.com/vercel/next.js/blob/ad6907a8a37e930639af071203f4ce49a5d69ee5/packages/next/src/build/webpack-build/impl.ts#L203
       * It will first run "server" compiler, then "edge-server" compiler, and finally "client" compiler.
       *
       * The "webpackBuildImpl" function is invoked by "webpackBuild" function: https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/webpack-build/index.ts#L124
       *
       * If build worker is enabled, the multi-stage build is managed by the build entrypoint, and the "client", "server" and "edge-server" compilerName
       * is passed to "webpackBuildImpl" through "webpackBuild" function:
       * https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/index.ts#L905
       * https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/index.ts#L1796
       *
       * Note that, if a custom webpack config is provided, Next.js will always disable build worker: https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/index.ts#L1723
       * We will not take that as an assumption. We already overwrite "nextConfig.experimental.webpackBuildWorker" to false in the Next.js plugin.
       *
       * Now all compiler instances are running in the same process, we can use a global variable to track stylex rules from different compilers.
       *
       * Back to "runCompiler". "runCompiler" accepts webpack configurations which is created by "getBaseWebpackConfig" function: https://github.com/vercel/next.js/blob/ad6907a8a37e930639af071203f4ce49a5d69ee5/packages/next/src/build/webpack-build/impl.ts#L128
       *
       * Inside "getBaseWebpackConfig" function, there is a "buildConfiguration" function: https://github.com/vercel/next.js/blob/ad6907a8a37e930639af071203f4ce49a5d69ee5/packages/next/src/build/webpack-config.ts#L2464
       * Inside "buildConfiguration" function there is a curried "base" function: https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/webpack/config/index.ts#L73
       * Inside the "base" function, the compiler name is attached to the webpack configuration: https://github.com/vercel/next.js/blob/c0c75e4aaa8ece2c9e789e2e3f150d7487b60bbc/packages/next/src/build/webpack/config/blocks/base.ts#L24
       */

      compilation.hooks.finishModules.tap(
        PLUGIN_NAME,
        (modules) => {
          for (const mod of modules) {
            if (mod.buildInfo && BUILD_INFO_STYLEX_KEY in mod.buildInfo) {
              const stylexBuildInfo = mod.buildInfo[BUILD_INFO_STYLEX_KEY];
              if (
                typeof stylexBuildInfo === 'object'
                && stylexBuildInfo != null
                && 'resourcePath' in stylexBuildInfo
                && 'stylexRules' in stylexBuildInfo
                && typeof stylexBuildInfo.resourcePath === 'string'
              ) {
                logger.debug(`collecting stylex rules from ${stylexBuildInfo.resourcePath}'s build info`);

                this.stylexRules.set(
                  stylexBuildInfo.resourcePath,
                  stylexBuildInfo.stylexRules
                );
              }
            }
          };
        }
      );

      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_NAME,
          stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
        },
        async (assets) => {
          if (this.loaderOption.nextjsMode && this.loaderOption.nextjsAppRouterMode && isNextJsCompilerName(compiler.name)) {
            if (compiler.name === NEXTJS_COMPILER_NAMES.server || compiler.name === NEXTJS_COMPILER_NAMES.edgeServer) {
              (globalThis.__stylex_nextjs_global_registry__ ??= new Map<NextJsCompilerName, Map<string, readonly StyleXRule[]>>())
                .set(compiler.name, this.stylexRules);

              // we don't need to do anything more in server/edge compiler, no CSS generation is needed
              return;
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- type safe
            if (compiler.name === NEXTJS_COMPILER_NAMES.client) {
              const globalRegistry = globalThis.__stylex_nextjs_global_registry__;
              if (globalRegistry != null) {
                // now we merge all collected rules from other compilers
                globalRegistry.forEach((rules) => {
                  rules.forEach((rule, resourcePath) => {
                    this.stylexRules.set(resourcePath, rule);
                  });
                });
              }
            } else {
              const _neverguard: never = compiler.name;
            }
          }

          const stylexCSS = getStyleXRules(this.stylexRules, this.useCSSLayers);

          if (stylexCSS == null) {
            return;
          }

          const finalCss = await this.transformCss(stylexCSS);

          const stylexChunk = compilation.namedChunks.get(STYLEX_CHUNK_NAME);

          if (!stylexChunk) return;

          // Let's find the css file that belongs to the stylex chunk
          const stylexChunkCssAssetNames = Object.keys(assets).filter((assetName) => stylexChunk.files.has(assetName) && assetName.endsWith('.css'));

          if (stylexChunkCssAssetNames.length === 0) {
            return;
          }
          if (stylexChunkCssAssetNames.length > 1) {
            logger.warn('Multiple CSS assets found for the stylex chunk. This should not happen. Please report this issue.');
          }

          const stylexAssetName = stylexChunkCssAssetNames[0];

          compilation.updateAsset(
            stylexAssetName,
            () => new RawSource(finalCss),
            {
              minimized: false
            }
          );
        }
      );
    });
  }
}
