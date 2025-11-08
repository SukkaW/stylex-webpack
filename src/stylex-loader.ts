import type { LoaderContext as WebpackLoaderContext } from 'webpack';
import { transformAsync as babelTransformAsync } from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import type { Options as StyleXOptions } from '@stylexjs/babel-plugin';
import { nullthrow } from 'foxts/guard';
import { BUILD_INFO_STYLEX_KEY, LOADER_TRANSFORMED_FLAG, VIRTUAL_STYLEX_CSS_DUMMY_IMPORT_PATH } from './constants';
import { stringifyRequest } from './lib/stringify-request';

const PLUGIN_NAME = 'stylex';

export interface StyleXLoaderOptions {
  stylexImports: string[],
  stylexOption: Partial<StyleXOptions>,
  nextjsMode: boolean,
  nextjsAppRouterMode: boolean
}

export default async function stylexLoader(this: WebpackLoaderContext<StyleXLoaderOptions>, inputCode: string, inputSourceMap: any) {
  const callback = this.async();

  // bail out early if already transformed
  // for some reason, a module might be passed to stylex-loader more than once, happened with Next.js App Router
  if (inputCode.includes(LOADER_TRANSFORMED_FLAG)) {
    return callback(null, inputCode, inputSourceMap);
  }

  const {
    stylexImports,
    stylexOption
  } = this.getOptions();

  // bail out early if the input doesn't contain stylex imports
  if (!stylexImports.some((importName) => inputCode.includes(importName))) {
    return callback(null, inputCode, inputSourceMap);
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

    nullthrow(this._module?.buildInfo, '[stylex-webpack] Expected "this._module.buildInfo" to be defined')[BUILD_INFO_STYLEX_KEY] = {
      resourcePath: this.resourcePath,
      stylexRules: metadata.stylex
    };

    // Add a dummy virtual import that will be picked up by virtual dummy import loader to add fake CSS to invalidate HMR
    const urlParams = new URLSearchParams({
      from: this.resourcePath,
      stylex: JSON.stringify(metadata.stylex) // color: #fff is not url safe, let's get through JSON.stringify
    });
    const virtualCssRequest = stringifyRequest(
      this,
      `${VIRTUAL_STYLEX_CSS_DUMMY_IMPORT_PATH}?${urlParams.toString()}`
    );
    const postfix = `\nimport ${virtualCssRequest};\n${LOADER_TRANSFORMED_FLAG}`;

    return callback(null, code + postfix, map ?? undefined);
  } catch (error) {
    return callback(error as Error);
  }
}
