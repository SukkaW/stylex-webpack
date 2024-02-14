import type webpack from 'webpack';
import babel from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Options as StyleXOptions } from '@stylexjs/babel-plugin';
import { stringifyRequest } from './lib/stringify-request';

const PLUGIN_NAME = 'stylex';
const emptyCssExtractionFile = require.resolve('./stylex.virtual.css');

export interface StyleXLoaderOptions {
  stylexImports: string[],
  stylexOption: Partial<StyleXOptions>
}

export default async function style9Loader(this: webpack.LoaderContext<StyleXLoaderOptions>, inputCode: string, inputSourceMap: any) {
  const callback = this.async();
  const {
    stylexImports,
    stylexOption
  } = this.getOptions();

  // bail out early if the input doesn't contain stylex imports
  if (!stylexImports.some((importName) => inputCode.includes(importName))) {
    callback(null, inputCode, inputSourceMap);
  }

  try {
    const { code, map, metadata } = (await babel.transformAsync(
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
          [
            stylexBabelPlugin,
            stylexBabelPlugin.withOptions(stylexOption)
          ]
        ]
      }
    ))!;

    // If metadata.stylex doesn't exist at all, we only need to return the transformed code
    if (
      !metadata
      || !('stylex' in metadata)
      || metadata.stylex == null
    ) {
      callback(null, code ?? undefined, map ?? undefined);
      return;
    }

    const logger = this._compiler?.getInfrastructureLogger(PLUGIN_NAME);
    // this.stylexRules[filename] = metadata.stylex;
    logger?.debug(`Read stylex styles from ${this.resourcePath}:`, metadata.stylex);

    const virtualCssRequest = stringifyRequest(
      this,
      `${emptyCssExtractionFile}?${JSON.stringify(metadata.stylex)}`
    );
    const postfix = `\nimport ${virtualCssRequest};`;

    callback(null, code + postfix, map ?? undefined);
  } catch (error) {
    callback(error as Error);
  }
}
