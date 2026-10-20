import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

export default defineConfig({
  plugins: [pluginReact()],
  
  html: {
    template: './index.html',
  },

  source: {
    entry: {
      index: './src/main.tsx',
    },
  },

  // Vendors follow the chunks that use them (#130): React, React Router and axios get their own
  // initial chunks; Firebase Auth (observed by the app shell at startup) stays in the shared
  // initial vendor chunk; the visualization stack is reachable only from the lazy live-run page.
  // ECharts is forced into its own async chunk so it caches apart from Cosmograph + DuckDB-WASM.
  // Do not switch to 'single-vendor': one vendor chunk would put that stack back on the login page.
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
      forceSplitting: {
        'lib-echarts': /node_modules[\\/](echarts|echarts-for-react|zrender|size-sensor)[\\/]/,
      },
    },
  },

  tools: {
    rspack: {
      plugins: [
        process.env.RSDOCTOR && 
          new RsdoctorRspackPlugin({
            disableClientServer: false,
            features: ['loader', 'plugins', 'bundle'],
          }),
      ].filter(Boolean),
    },
  },

  server: {
    port: 4000,
    open: true,
  },

  dev: {
    hmr: true,
  },
});