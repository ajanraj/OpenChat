import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import oxlintPlugin from "vite-plugin-oxlint";
import { VitePWA } from "vite-plugin-pwa";

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    devtools(),
    oxlintPlugin({
      configFile: ".oxlintrc.json",
    }),
    nitro({
      compatibilityDate: "2025-12-24",
      vercel: {
        functions: {
          maxDuration: 300,
        },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({
      // https://react.dev/learn/react-compiler
      presets: [reactCompilerPreset()],
    }),
    VitePWA({
      outDir: ".output/public",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-icon.png", "robots.txt"],
      manifest: false,
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
    noExternal: ["streamdown", /@streamdown\/.*/, /@phosphor-icons\/.*/, /@ridemountainpig\/.*/],
  },
  // Pre-bundle icon packages for faster dev server startup
  optimizeDeps: {
    include: [
      "@phosphor-icons/react",
      "lucide-react",
      "@ridemountainpig/svgl-react",
      "@shikijs/core",
      "katex",
      "lodash-es",
      "react-markdown",
      "rehype-katex",
      "rehype-raw",
      "remark-cjk-friendly",
      "remark-gfm",
      "remark-math",
      "swr",
      "unist-util-visit",
      "mermaid",
      "@braintree/sanitize-url",
      "@streamdown/code",
      "@streamdown/mermaid",
      "es-toolkit",
      "es-toolkit/compat",
      "marked",
    ],
  },
});

export default config;
