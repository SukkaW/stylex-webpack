import type webpack from 'webpack';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Rule as StyleXRule, Options as StyleXOptions } from '@stylexjs/babel-plugin';
import path from 'path';
import type { StyleXLoaderOptions } from './stylex-loader';

const loaderPath = require.resolve('./stylex-loader');

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
  rootDir?: string
}

const getStyleXRules = (stylexRules: Map<string, StyleXRule>, useCSSLayers: boolean) => {
  if (stylexRules.size === 0) {
    return null;
  }
  // Take styles for the modules that were included in the last compilation.
  const allRules = Array.from(stylexRules.keys())
    .flatMap<StyleXRule>(filename => stylexRules.get(filename)!);

  return stylexBabelPlugin.processStylexRules(
    allRules,
    useCSSLayers
  );
};

const PLUGIN_NAME = 'stylex';

export class StyleXPlugin {
  static loader = loaderPath;

  stylexRules = new Map<string, any>();
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
    const { Compilation, NormalModule, sources } = compiler.webpack;
    const { ConcatSource, RawSource } = sources;

    // Apply loader to JS modules
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      NormalModule.getCompilationHooks(compilation).loader.tap(
        PLUGIN_NAME,
        (_loaderContext, mod) => {
          const extname = path.extname(mod.resource);

          if (
          // JavaScript (and Flow) modules
            /\.jsx?/.test(extname)
              // TypeScript modules
              || /\.tsx?/.test(extname)
          ) {
            // We use .push() here instead of .unshift()
            // Webpack usually runs loaders in reverse order and we want to ideally run
            // our loader before anything else.
            mod.loaders.push({
              loader: loaderPath,
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
          // This is chosen because it needs to happen after mini-css-extract-plugin
          stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE
        },
        (assets) => {
          const cssFileName = Object.keys(assets).find(this.appendTo);
          const stylexCSS = getStyleXRules(this.stylexRules, this.useCSSLayers);

          if (cssFileName && stylexCSS != null) {
            compilation.updateAsset(
              cssFileName,
              (originalSource) => new ConcatSource(
                originalSource.source() as string,
                new RawSource(stylexCSS)
              ) as webpack.sources.Source
            );
          }
        }
      );
    });
  }
}
