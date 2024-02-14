import type webpack from 'webpack';
import babel from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';

const PLUGIN_NAME = 'stylex';
const emptyCssExtractionFile = require.resolve('./stylex.virtual.css');

export interface StyleXLoaderOptions {
  stylexImports: string[]
}

export default async function style9Loader(this: webpack.LoaderContext<StyleXLoaderOptions>, inputCode: string, inputSourceMap: any) {
  const callback = this.async();
  const {
    stylexImports
  } = this.getOptions();

  // bail out early if the input doesn't contain stylex imports
  if (!stylexImports.some((importName) => inputCode.includes(importName))) {
    callback(null, inputCode, inputSourceMap);
  }

  const { code, map, metadata } = await babel.transformAsync(
    inputCode,
    {
      babelrc: false,
      inputSourceMap,
      sourceFileName: this.resourcePath,
      filename: this.resourcePath,
      parserOpts: {
        plugins: /\.tsx?$/.test(this.resourcePath)
          ? ['typescript', 'jsx']
          : ['jsx']
      },
      // Use TypeScript syntax plugin if the filename ends with `.ts` or `.tsx`
      // and use the Flow syntax plugin otherwise.
      plugins: [
        [
          stylexBabelPlugin,
          {
            dev,
            useRemForFontSize,
            aliases,
            runtimeInjection: false,
            genConditionalClasses: true,
            treeshakeCompensation: true,
            importSources: stylexImports
          }
        ]
      ]
    }
  );

  const logger = this._compiler?.getInfrastructureLogger(PLUGIN_NAME);
}
