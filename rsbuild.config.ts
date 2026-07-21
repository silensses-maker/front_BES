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