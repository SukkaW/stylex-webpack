# The Frustration of Developing a Plugin for Next.js

Developing a Next.js plugin can be and will be an absolute nightmare, thanks to Vercel's complex and opaque nature of the framework's internals, unorthodox conventions, and lack of documentation/communication/explanation of the framework's convoluted infrastructures, leaving developers like me to reverse-engineer spaghetti code without any support.

As a former Next.js enthusiast, top 47# contributor of Next.js with over 80 merged PRs, was featured in Next.js Conf 2024 as a distinguished contributor, was invited to Vercel's `#external-next-contributor` Slack channel, I still got zero useful responses from the Next.js team or Vercel when I desperately sought answers.

Now, imagine the hell for average users who aren't insiders: they could be doomed to endless frustration, hacks, and broken features. Vercel's opacity and silence have crushed my passion for Next.js, turning what should be an empowering open-source tool into a betrayal of its community, especially those of us who poured our hearts into it. This isn't just about complexity—it's neglect that sabotages innovation and leaves contributors feeling utterly abandoned.

-----

Now you have read all the bullet points. But if you are interested, let me share the full struggle I went through.

## How does StyleX works?

[First introduced by Frank Yan at React Conf 2020](https://www.youtube.com/watch?v=9JZHodNR184), [StyleX](https://stylexjs.com/) is a framework agnostic CSS-in-JS system with near-zero runtime, ahead-of-time compiler, atomic CSS extraction that powers Facebook and Instagram. You can watch that talk on YouTube and visit the website of StyleX to learn more about it.

But for the sake of this article, I will give a brief overview of how StyleX works from a compiler/bundler standpoint.

Developers will declare their style using `stylex.create` API that looks like this:

```tsx
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  red: {
    color: 'red'
  }
});

<div {...stylex.props(styles.red)} />
```

The StyleX bundler plugin should collect all the style rules (`color: red` in the above example) declared in `stylex.create`, and transform the `stylex.create` call to a plain object literal that maps the style names to generated atomic class names, like this:

```tsx
import * as stylex from '@stylexjs/stylex';

const styles = {
  red: {
    "Color-Hashed_CSS_Value": "Random-But-Deterministic-ClassName",
  }
};

// Under the hood, stylex.props is just a helper function that extracts the relevant class names from the style object and join them as a string.
<div {...stylex.props(styles.red)} />

// StyleX compiler is actually way smarter than that. It can actually pre-compute the className as much as possible, and eliminate the entire
// runtime call to "stylex.props", generating static "className" and "style" props.

// But for the sake of this article, let's keep it simple.
```

And then the StyleX bundler plugin should consolidate all the collected style rules (because `Random-But-Deterministic-ClassName` doesn't work without a CSS file), generating the corresponding CSS, and emitting a CSS asset during the bundler's build process. The CSS file will look something like this:

```css
.Random-But-Deterministic-ClassName {
  color: red;
}
```

In a way, StyleX bundler plugin kinda looks like Tailwind CSS: You collect all the style rules written in JSX/TSX, generate atomic CSS class names, and emit a CSS file. But Tailwind CSS doesn't have to touch JSX/TSX code, because you are already writing `className`. On the other hand, the StyleX compiler must transform the `stylex.create` call to a plain object literal (and optionally, pre-compute or inline the `stylex.props` call).

## Let's begin with a webpack-loader

Since we are touching JSX/TSX code, and Next.js uses webpack (unless you have enabled Turbopack), the obvious choice is to start with a webpack-loader.

Now the problem is, where do we store all the stylex rules? Just like Tailwind CSS, StyleX needs to collect all style rules and then generate CSS in one pass (using the `processStylexRules` method exported by `@stylexjs/babel-plugin`). So before we consolidate and emit the CSS file, we need to store all the collected stylex rules somewhere, while the webpack loader is being executed.

So I did what all webpack plugins do, I store all the information (in this case, style rules) as a private class field of the webpack plugin instance (usually the webpack plugin is a `class` that implements `apply(compiler)` method). I then provide/supplement a callback function to the webpack-loader context, so that the webpack-loader can pass all the style rules back to the webpack plugin instance through this callback.

> BTW, this approach will not work with Turbopack, because Turbopack doesn't provide any way for loaders to pass information back to the main compilation process. They run loaders in an isolated environment/threads. Rspack also has this limitation. If it is possible, feel free to reach out to me and we can discuss how to make it work with Rspack/Turbopack.

Guess what? This approach works perfectly fine with Next.js Pages Router, but completely borks with Next.js App Router!

Only partial styles are collected, and the generated CSS is incomplete. More specifically, only styles declared in the client components are collected, while styles declared in the server components are completely ignored.

What's going on?

## How Next.js compiles React Server Components

Of course, **this is never documented anywhere on the Next.js docs**. I have asked this in Vercel's Slack back in mid-2024. But I **never get any response from Next.js Team or Vercel**.

But never mind. I was an active Next.js contributor, and I am already very good at reading Next.js' spaghetti codebase. So I just dove into the source code of Next.js and figured it out myself. I will skip hours of struggling, and just give you a nutshell summary:

Next.js will spin up separate webpack compilers during the build: one for the client bundle, one for the server bundle (actually, there are also edge runtime server bundle and node.js server runtime bundle, but let's ignore all that shit loads of complexity, and just focus on the fact that there are many webpack compilers). If you use `console.log('what a fuck!?')` in `next.config.js`'s `webpack` function (which is used to customize webpack plugin), you will see `what a fuck!?` being logged more than once, that's Next.js trying to apply your webpack config customization for each webpack compiler spun up. When I register `new StyleXWebpackPlugin()`, I actually register separate webpack plugin instances for each compiler.

And unlike Next.js Pages Router where all there is only client component (so all components are compiled both in the "server compiler" and "client compiler"), with Next.js App Router, "server compiler" can see both server components and client components (because no matter RSC or RCC, they will all be evaluated on the server during SSR to get HTML), "client compiler" can only see client components (becasue RSC can/will contain server-only logic that can't be executed on the browser).

If this is true, the "server compiler" will be able to see all StyleX rules while the "client compiler" will only see StyleX rules declared in client components. And each compiler has its own stylex webpack plugin instance and emits its own CSS. So I need to find a way to pass stylex rules around.

## Share StyleX rules between compilers

It is impossible for a webpack plugin to figure out which compiler it is being executed in; we basically need to share stylex rules between different plugin instances.

Then, I remember a workaround I created to overcome another Next.js quirk: Next.js can actually collect server imports and send them to the client compiler using Next.js' self-baked `FlightClientEntryPlugin`. The relevant code is written by @shuding :

https://github.com/vercel/next.js/blob/3a9bfe60d228fc2fd8fe65b76d49a0d21df4ecc7/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts#L425-L429

@shuding actually made a lethal mistake here. Instead of passing the entire mod information, he only passed `path + query`. This means the webpack loader information embedded in dynamically generated virtual import (something looks like `!!css-transform-loader!=!./some-resource.css`) will be lost, and only `./some-resource.css` will be passed. This creates shit loads of issues back in the days:

- https://github.com/SukkaW/style9-webpack/issues/1
- https://github.com/microsoft/griffel/issues/266
- https://github.com/vercel/next.js/pull/45835
- https://github.com/emotion-js/emotion/issues/2978
- https://github.com/vanilla-extract-css/vanilla-extract/issues/1086
- https://github.com/vanilla-extract-css/vanilla-extract/issues/929

Once again, the entire community is not getting any support from Vercel. And once again, I have asked this in the `external-next-contributor` channel of Vercel's Slack workspace. At that time, @devjiwonchoi from the Next.js team actually noticed my question, but he didn't know the internal Next.js compilation/bundling process at all at the moment, so he cc'd @sokra, the creator of webpack, who had been working at Vercel on Turbopack for a while at that moment. **And then I never get a response from @sokra. In fact, I never get any response from Next.js Team or Vercel ever on this topic**.

It is I who found the first possible workaround alone all by myself: by passing information in the query, which is not a standard webpack way to do this (the standard way would be embedding the loader directly in the import request like `!!css-transform-loader!=!./some-resource.css`). This is all because of Next.js' internal quirk that doesn't comply with webpack's standard behavior.

Since I discovered that workaround, it is actually pretty easy for me to come up with a similar solution for this specific "server/client separate stylex rules":

First, the webpack-loader will create an import to a noop file, holding stylex rules in the query string of the import request:

```js
// Existing code

// Adding an import to noop:
import "/path/to/node_modules/stylex-webpack/dist/stylex.fuck-nextjs.virtual-carrier.css?stylex=[JSON stringified stylex rules]"
```

> From the name `stylex.fuck-nextjs.virtual-carrier.css`, you can see how frustrated and desperate I was when implementing this.

Note that this noop import has to be a CSS import (took me another few hours to figure out), because Next.js will only pass CSS imports between different compilers. That actually makes sense, as I discussed before, server components might contain JavaScript code that is not meant to be executed on the client, but on the other hand, the CSS imported/created by the server components must be sent to the client.

Second, we need to enforce a chunk to be generated using `splitChunks.cacheGroups` options:

```js
compiler.options.optimization.splitChunks.cacheGroups[FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME] = {
  name: FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME,
  test: FUCK_NEXTJS_VIRTUAL_CARRIER_PATTERN,
  type: 'css/mini-extract',
  chunks: 'all',
  enforce: true
};
```

This ensures only one webpack chunk is generated, containing all `stylex.fuck-nextjs.virtual-carrier.js` imports appended by the webpack loader.

Because Next.js uses `MiniCssExtractPlugin` under the hood, with all our `stylex.fuck-nextjs.virtual-carrier.css` imports, `MiniCssExtractPlugin` will extract and create a CSS chunk. We can then gather all `stylex.fuck-nextjs.virtual-carrier.js` imports from webpack's chunk graph, during webpack's `postAsset` hook:

```ts
compilation.hooks.processAssets.tapPromise(
  {
    name: PLUGIN_NAME,
    stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
  },
  async (assets) => {
    if (this.loaderOption.nextjsMode) {
      const fuckNextjsChunk = compilation.namedChunks.get(FUCK_NEXTJS_VIRTUAL_CARRIERCHUNK_NAME);

      if (fuckNextjsChunk) {
        const modulesInFuckNextjsChunk = compilation.chunkGraph.getChunkModulesIterableBySourceType(fuckNextjsChunk);
        if (modulesInFuckNextjsChunk) {
          for (const mod of (modulesInFuckNextjsChunk as Iterable<CssModule>)) {
            if (!('_identifier' in mod) || typeof mod._identifier !== 'string') {
              continue;
            }

            const stringifiedStylexRule = mod._identifier.split('!').pop()?.split('?').pop();
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
    }
    // some other CSS process and inject logic goes here
  }
);
```

Having collected all stylex rules from both server components and client components, we can finally generate the complete CSS and inject it into an asset.

Luckily, we already have a CSS chunk, as described before, created by `MiniCssExtractPlugin`. We just need to inject our generated CSS into an asset that belongs to that chunk.

```js
compilation.hooks.processAssets.tapPromise(
  {
    name: PLUGIN_NAME,
    stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
  },
  async (assets) => {
    // continues from the previous code snippet, inject logic goes here

    const finalCss = getStyleXRules(this.stylexRules);

    // Let's find the css file that belongs to the stylex chunk
    const stylexChunkCssAssetNames = Object.keys(assets).filter((assetName) => fuckNextjsChunk.files.has(assetName) && assetName.endsWith('.css'));

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
);
```

Guess what? It doesn't work with App Router again! During the development, all components are compiled on demand, and the final CSS will change (and grow bigger) as you navigate to different pages, thus HMR should have reloaded the CSS. But no, the CSS chunk is only loaded for the first time, and later navigations never have the CSS.

What's going on here?

## HMR, fucking HMR

And this is the "server compiler" and "client compiler" bullshit again. During new navigation, there might be new client components only, or new server components only, or both, or none. We called `compilation.updateAsset` within both "server compiler" and "client compiler", but sometimes only one compiler will get the latest full CSS (the other compiler doesn't see new components, no new style rules, so no new css), so it might never get HMR to trigger the CSS updates, depending on which compiler receives the new stylex rules and new CSS.

Once again, within the webpack plugin, we have no idea which compiler we are in. So how can we trigger HMR correctly? I have to resort to a dirty hack: `webpack-virtual-module`.

> And `webpack-virtual-module` is not supported by Turbopack as well. So this approach will never work with Turbopack.

First, we can no longer rely on Next.js' automatically generated CSS chunk; we will need another noop "virtual" CSS import that lives in the Root Layout:

```tsx
// src/layout.tsx

// A virtual CSS import in the root layout
import 'stylex-webpack/stylex.css';

export default function RootLayout({ children }: React.PropsWithChildren) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

And we will need `splitChunks.cacheGroups` options to generate a dedicated chunk specifically for this virtual CSS import. This CSS chunk will now only contain `stylex-webpack/stylex.css`.

Now, instead of calling `compilation.updateAsset` in the `processAssets` hook, we will use `webpack-virtual-module` to trick webpack into thinking the content of `stylex-webpack/stylex.css` file on the disk has changed, thus triggering another HMR:

```ts
compilation.hooks.processAssets.tapPromise(
  {
    name: PLUGIN_NAME,
    stage: Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS
  },
  async (assets) => {
    // continues from the previous code snippet, inject logic goes here

    const finalCss = getStyleXRules(this.stylexRules);

    this._virtualModuleInstance.writeModule(VIRTUAL_ENTRYPOINT_CSS_PATH, finalCss.toString());
  }
);
```

From Next.js' HMR standpoint, `stylex-webpack/stylex.css` is a real CSS file on the disk that is imported in the Root Layout, and it is getting updated. Thus, no matter whether the "server compiler" or "client compiler" (since the Root Layout could be a client component, we wouldn't be entirely sure which compiler will be triggered, but this doesn't matter) will always see the CSS changes and trigger a CSS reload.

This will drastically hurt the HMR performance, because we basically HMR twice instead of once:

- The normal HMR during navigation or source code update
- During the HMR, the `webpack-virtual-module` "write" to the virtual CSS file, triggering another HMR
- In another HMR, the CSS get updated

## The End

And that is the entire story of how I developed a Next.js plugin. I have spent weeks reading and understanding Next.js' spaghetti codebase, experimenting with various approaches, and I am still not sure I have understood it correctly, and I still don't know if this is the best approach. Feel free to reach out to me if you have any better ideas.
