import type webpack from 'webpack';
import { transformAsync as babelTransformAsync } from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Options as StyleXOptions } from '@stylexjs/babel-plugin';
import { stringifyRequest } from './lib/stringify-request';
import { VIRTUAL_CSS_PATH, isSupplementedLoaderContext } from './constants';
import loaderUtils from 'loader-utils';

const PLUGIN_NAME = 'stylex';

export interface StyleXLoaderOptions {
  stylexImports: string[],
  stylexOption: Partial<StyleXOptions>
}

export default async function stylexLoader(this: webpack.LoaderContext<StyleXLoaderOptions>, inputCode: string, inputSourceMap: any) {
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

    // TODO: rspack doesn't support custom loader context
    // Find a better way to register stylex rules to the compiler instance
    this.StyleXWebpackContextKey.registerStyleXRules(
      this.resourcePath,
      metadata.stylex as any
    );

    const serializedStyleXRules = JSON.stringify(metadata.stylex);
    const virtualFileName = loaderUtils.interpolateName(
      this,
      '[path][name].[hash:base64:8].stylex.virtual.css',
      { content: serializedStyleXRules }
    );

    const virtualCssRequest = stringifyRequest(
      this,
      `${virtualFileName}!=!${VIRTUAL_CSS_PATH}?${serializedStyleXRules}`
    );
    const postfix = `\nimport ${virtualCssRequest};`;

    return callback(null, code + postfix, map ?? undefined);
  } catch (error) {
    return callback(error as Error);
  }
}
