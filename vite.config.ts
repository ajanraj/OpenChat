import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import oxlintPlugin from "vite-plugin-oxlint";
import { VitePWA } from "vite-plugin-pwa";

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    oxlintPlugin({
      configFile: ".oxlintrc.json",
    }),
    devtools(),
    nitro({
      compatibilityDate: "2025-12-24",
      vercel: {
        functions: {
          maxDuration: 300,
          runtime: "bun1.x",
        },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact({
      // https://react.dev/learn/react-compiler
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "19",
            },
          ],
        ],
      },
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-icon.png", "robots.txt"],
      manifest: false,
      devOptions: {
        enabled: true,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  // Fix for packages with ESM directory imports during SSR
  ssr: {
    noExternal: [/@lobehub\/.*/, /@phosphor-icons\/.*/, /@ridemountainpig\/.*/],
  },
  // Pre-bundle icon packages for faster dev server startup
  optimizeDeps: {
    include: [
      "@lobehub/icons",
      "@phosphor-icons/react",
      "lucide-react",
      "@ridemountainpig/svgl-react",
    ],
  },
});

export default config;
