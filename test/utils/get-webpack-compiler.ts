import path from 'node:path';

import * as webpack from 'webpack';
import { createFsFromVolume, Volume } from 'memfs';

import pkgJson from '../../package.json';
import { builtinModules } from 'node:module';
import type { Options as SwcOptions } from '@swc/core';

import { StyleXPlugin } from '../../src';
import type { StyleXPluginOption } from '../../src';

import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { nullthrow } from 'foxts/guard';

export const externalModules = Object.keys(pkgJson.dependencies)
  .concat(Object.keys(pkgJson.peerDependencies))
  .concat(builtinModules)
  .concat(['react', 'react/jsx-runtime', 'preact/hooks', 'preact/compat', 'preact']);

function useSwcLoader(isTSX: boolean) {
  return {
    loader: 'swc-loader',
    options: {
      jsc: {
        parser: {
          syntax: isTSX ? 'typescript' : 'ecmascript',
          ...(
            isTSX
              ? { tsx: true }
              : { jsx: true }
          )
        },
        target: 'esnext',
        transform: {
          react: {
            runtime: 'automatic',
            refresh: false,
            development: false
          }
        }
      }
    } satisfies SwcOptions
  };
}

export default (fixture: string, pluginOption?: StyleXPluginOption, config: webpack.Configuration = {}) => {
  const fullConfig: webpack.Configuration = {
    mode: 'development',
    target: 'web',
    devtool: config.devtool || false,
    context: path.resolve(__dirname, '../fixtures'),
    entry: Array.isArray(fixture)
      ? fixture
      : path.resolve(__dirname, '../fixtures', fixture),
    output: {
      path: '/',
      filename: '[name].bundle.js',
      chunkFilename: '[name].chunk.js',
      publicPath: '/webpack/public/path/',
      assetModuleFilename: '[name][ext]'
    },
    module: {
      rules: [
        {
          test: /\.[cm]?[jt]sx$/i,
          exclude: /node_modules/,
          use: [
            useSwcLoader(true)
          ]
        },
        {
          test: /\.css$/i,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader'
          ]
        }
        // {
        //   test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/i,
        //   resourceQuery: /^(?!.*\?ignore-asset-modules).*$/,
        //   type: 'asset/resource'
        // },
        // {
        //   resourceQuery: /\?ignore-asset-modules$/,
        //   type: 'javascript/auto'
        // }
      ]
    },
    optimization: {
      minimize: false,
      splitChunks: {
        cacheGroups: {}
      }
    },
    externals: externalModules,
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css',
        chunkFilename: '[name].css',
        ignoreOrder: true
      }),
      new StyleXPlugin(pluginOption)
    ],
    ...config
  };

  const compiler = nullthrow(webpack.webpack(fullConfig), 'missing webpack compiler');
  const fs = createFsFromVolume(new Volume()) as unknown as typeof import('fs');

  compiler.outputFileSystem = fs;

  return [compiler, fs] as const;
};
