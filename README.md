# stylex-webpack

[First introduced by Frank Yan at React Conf 2020](https://www.youtube.com/watch?v=9JZHodNR184), [StyleX](https://stylexjs.com/) framework agnostic CSS-in-JS system with near-zero runtime, ahead-of-time compiler, atomic CSS extraction that powers Facebook and Instagram.

## Motivation

stylex offers a CSS-in-JS compiler, allowing you to write CSS in your JavaScript/JSX/TSX. However, unlike other CSS-in-JS solutions that gather and process styles within the browser, stylex will read your source code, collect your style and transform your JS/JSX/TSX, stripping runtime calls as much as possible (making the value of `className` a static string literal), and output CSS elsewhere.

StyleX does provide a webpack plugin. Under the hood, it will traverse through the source code, collect styles, and emit a new CSS asset during the webpack compilation. However, it does come with some limitations:

- StyleX's official Next.js setup requires a `.babelrc` file, which disables Next.js' built-in SWC compiler.
- StyleX's official Next.js plugin requires a CSS asset to pre-exist so that it can append the extracted CSS to it.

I start this project as a Proof of Concept, to see if it is possible to make a webpack plugin for ststylex that doesn't disable Next.js' SWC compiler. I have already made [a similar webpack plugin for style9](https://github.com/sukkaw/style9-webpack), which is also an AoT atomic CSS-in-JS system that is inspired by StyleX.

Unlike stylex's official webpack plugin, `stylex-webpack` requires you have setup `css-loader` and `MiniCssExtractPlugin` in your webpack configuration, just like your normal CSS based webpack project. `stylex-webpack`'s built-in loader will generate a virtual CSS import containing a dummy CSS rule. This allows the `MiniCssExtractPlugin` to collect those virtual CSS imports and emit a CSS asset, which `stylex-webpack` will later inject the actual extracted CSS into at the `processAssets` stage.

## Installation

```sh
# npm
npm i stylex-webpack
# Yarn
yarn add stylex-webpack
# pnpm
pnpm add stylex-webpack
```

## Usage

### Webpack

```js
// webpack.config.js
const { StyleXPlugin } = require('stylex-webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  module: {
    rules: [
      // Just like your normal CSS setup, a css-loader and MiniCssExtractPlugin.loader
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      }
    ]
  },
  plugins: [
    new StyleXPlugin({
      // stylex-webpack options goes here, see the following section for more details
    }),
    new MiniCssExtractPlugin(),
    new CssMinimizerPlugin()
    // You can also use `LightningCssMinifyPlugin` from `lightningcss-loader`
    // to replace CssMinimizerPlugin for faster CSS minification
    // https://github.com/fz6m/lightningcss-loader
  ]
};
```

### Next.js

```js
// next.config.js
const { withStyleX } = require('stylex-webpack/next');

module.exports = withStyleX({
  // stylex-webpack options goes here, see the following section for more details
})({
  // Your Next.js config goes here.
  reactStrictMode: true
});
```

## Options

### webpack

```ts
new StyleXPlugin({
  // stylex-webpack options

  /**
   * stylex options passed to stylex babel plugin
   *
   * @see https://stylexjs.com/docs/api/configuration/babel-plugin/
   */
  stylexOption: {
    dev: process.env.NODE_ENV === 'development',
    test: process.env.NODE_ENV === 'test'
    // Check the stylex documentation for more options
  },
  /* Specify where stylex will be imported from
   * This overrides `importSources` in the `stylexOption` above
   *
   * @default ['stylex', '@stylexjs/stylex']
   */
  stylexImports: ['stylex', '@stylexjs/stylex'],
  /**
   * Whether to use CSS layers
   *
   * @default false
   */
  useCSSLayers?: boolean,
  /**
   * Enable other CSS transformation
   *
   * Since stylex-webpack's loader only emit virtual CSS imports with dummy rules,
   * while the actual CSS is injected by the plugin after all loaders, you can not
   * use postcss-loader + PostCSS plugins. You can manually transform the CSS here.
   */
  transformCss(css) {
    const postcss = require('postcss');
    const autoprefixer = require('autoprefixer');
    /**
     * It is a known issue that stylex won't sort your at-rules and media queries.
     *
     * https://github.com/facebook/stylex/issues/455
     * https://github.com/facebook/stylex/issues/517
     *
     * For now, it is recommended to use postcss-sort-media-queries as a workaround.
     */
    const sortMediaQueries = require('postcss-sort-media-queries');

    return postcss([
      autoprefixer({
        // autoprefixer options
      }),
      sortMediaQueries({
        sort: 'mobile-first'
      })
    ]).process(css, { from: undefined }).css;

    // If you don't use custom PostCSS plugins (like `postcss-sort-media-queries`
    // mentioned above), only downleveling CSS syntax using autoprefixer, you can
    // also use LightningCSS. It is a Rust-based CSS transformer and minifier that
    // has built-in downleveling support.
    const browserslist = require('browserslist');
    const { transform, browserslistToTargets } = require('lightningcss');
    return transform({
      code: Buffer.from(css),
      targets: browserslistToTargets(browserslist('>= 0.25%'))
    }).code;

    // If you don't need to transform CSS at all, you can just return the input as-is as well.
    return css;
  }
});
```

### Next.js

```ts
withStyleX({
  // The same options as the webpack plugin, but with a few differences
  stylexOption: {
    /**
     * You don't have to specify `dev` here. `stylex-webpack` will automatically read
     * Next.js building mode and set `dev` accordingly.
     */
    // dev: process.env.NODE_ENV === 'development',
  },
  /**
   * You don't have to specify `transformCss` here. `stylex-webpack` will automatically
   * read your PostCSS configuration and apply it here, just like how Next.js does.
   *
   * Under the hood, `withStyleX` uses Next.js built-in PostCSS config reader to
   * maintain the consistency with Next.js' built-in PostCSS support.
   */
  // transformCss(css) {}
})
```

It is recommended to use `postcss-sort-media-queries` as a workaround for stylex's known issue with sorting at-rules and media queries. You can configure it in your PostCSS configuration file, and `stylex-webpack` will automatically apply your PostCSS configuration to the extracted CSS just like Next.js' built-in PostCSS support.

```js
// postcss.config.js

/** @type {Record<'plugins', import('postcss').AcceptedPlugin[]>} */
module.exports = {
  plugins: [
    [
      require.resolve('postcss-sort-media-queries'),
      {
        sort: 'mobile-first' // default value
      }
    ],

    // Next.js will disable its built-in default PostCSS configuration you
    // create `postcss.config.js`, which you can add it back:

    /* --- Start of Next.js built-in default PostCSS configuration --- */
    require.resolve('next/dist/compiled/postcss-flexbugs-fixes'),
    [
      require.resolve('next/dist/compiled/postcss-preset-env'),
      {
        browsers: ['defaults'],
        autoprefixer: {
          // Disable legacy flexbox support
          flexbox: 'no-2009'
        },
        // Enable CSS features that have shipped to the
        // web platform, i.e. in 2+ browsers unflagged.
        stage: 3,
        features: {
          'custom-properties': false
        }
      }
    ]
    /* --- End of Next.js built-in default PostCSS configuration --- */
  ]
};
```

## Author

**stylex-webpack** © [Sukka](https://github.com/SukkaW), Released under the [MIT](./LICENSE) License.<br>
Authored and maintained by Sukka with help from contributors ([list](https://github.com/SukkaW/stylex-webpack/graphs/contributors)).

> [Personal Website](https://skk.moe) · [Blog](https://blog.skk.moe) · GitHub [@SukkaW](https://github.com/SukkaW) · Telegram Channel [@SukkaChannel](https://t.me/SukkaChannel) · Twitter [@isukkaw](https://twitter.com/isukkaw) · Mastodon [@sukka@acg.mn](https://acg.mn/@sukka) · Keybase [@sukka](https://keybase.io/sukka)

<p align="center">
  <a href="https://github.com/sponsors/SukkaW/">
    <img src="https://sponsor.cdn.skk.moe/sponsors.svg"/>
  </a>
</p>
