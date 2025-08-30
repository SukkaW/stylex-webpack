import type { LoaderContext as WebpackLoaderContext } from 'webpack';
import { transformAsync as babelTransformAsync } from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Options as StyleXOptions } from '@stylexjs/babel-plugin';
import { isSupplementedLoaderContext } from './constants';

const PLUGIN_NAME = 'stylex';

export interface StyleXLoaderOptions {
  stylexImports: string[],
  stylexOption: Partial<StyleXOptions>,
  nextjsMode: boolean
}

export default async function stylexLoader(this: WebpackLoaderContext<StyleXLoaderOptions>, inputCode: string, inputSourceMap: any) {
  const callback = this.async();
  const {
    stylexImports,
    stylexOption
  } = this.getOptions();

  // bail out early if the input doesn't contain stylex imports
  if (!stylexImports.some((importName) => inputCode.includes(importName))) {
    return callback(null, inputCode, inputSourceMap);
  }

  if (!isSupplementedLoaderContext(this)) {
    return callback(new Error('stylex-loader: loader context is not SupplementedLoaderContext!'));
  }

  try {
    const { code, map, metadata } = (await babelTransformAsync(
      inputCode,
      {
        babelrc: false,
        inputSourceMap,
        sourceFileName: this.resourcePath,
        filename: this.resourcePath,
        parserOpts: {
          plugins: /\.tsx?$/.test(this.resourcePath)
            ? ['typescript', 'jsx']
            // TODO: add flow support here
            // https://github.com/babel/babel/issues/16264
            : ['jsx']
        },
        plugins: [
          stylexBabelPlugin.withOptions(stylexOption)
        ]
      }
    ))!;

    const logger = this._compiler?.getInfrastructureLogger(PLUGIN_NAME);

    // If metadata.stylex doesn't exist at all, we only need to return the transformed code
    if (
      !metadata
      || !('stylex' in metadata)
      || metadata.stylex == null
    ) {
      logger?.debug(`No stylex styles generated from ${this.resourcePath}`);
      return callback(null, code ?? undefined, map ?? undefined);
    }

    // this.stylexRules[filename] = metadata.stylex;
    logger?.debug(`Read stylex styles from ${this.resourcePath}:`, metadata.stylex);

    // TODO-RSPACK: doesn't support custom loader context
    // Find a better way to register stylex rules to the compiler instance
    this.StyleXWebpackContextKey.registerStyleXRules(
      this.resourcePath,
      metadata.stylex as any
    );

    return callback(null, code ?? undefined, map ?? undefined);
  } catch (error) {
    return callback(error as Error);
  }
}
