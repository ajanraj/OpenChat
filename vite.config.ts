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
        suppressWarnings: true,
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
    noExternal: [
      "streamdown",
      /@streamdown\/.*/,
      /@lobehub\/.*/,
      /@phosphor-icons\/.*/,
      /@ridemountainpig\/.*/,
    ],
  },
  // Pre-bundle icon packages for faster dev server startup
  optimizeDeps: {
    include: [
      "@lobehub/icons",
      "@phosphor-icons/react",
      "lucide-react",
      "@ridemountainpig/svgl-react",
      "@dnd-kit/core",
      "@dnd-kit/modifiers",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@emoji-mart/react",
      "@shikijs/core",
      "@shikijs/transformers",
      "ahooks",
      "antd",
      "antd-style",
      "chroma-js",
      "emoji-regex",
      "fast-deep-equal",
      "katex",
      "lodash-es",
      "polished",
      "rc-footer",
      "re-resizable",
      "react-avatar-editor",
      "react-error-boundary",
      "react-hotkeys-hook",
      "react-layout-kit",
      "react-markdown",
      "react-merge-refs",
      "rehype-github-alerts",
      "rehype-katex",
      "rehype-raw",
      "remark-cjk-friendly",
      "remark-gfm",
      "remark-math",
      "shiki-stream",
      "swr",
      "ts-md5",
      "unist-util-visit",
      "url-join",
      "use-merge-value",
      "mermaid",
      "@braintree/sanitize-url",
      "@streamdown/code",
      "@streamdown/mermaid",
      "@base-ui/react/autocomplete",
      "@base-ui/react/context-menu",
      "@base-ui/react/menu",
      "@base-ui/react/merge-props",
      "@base-ui/react/popover",
      "@base-ui/react/scroll-area",
      "@base-ui/react/select",
      "@base-ui/react/switch",
      "@base-ui/react/toast",
      "@base-ui/react/tooltip",
      "@pierre/diffs/react",
      "es-toolkit",
      "es-toolkit/compat",
      "marked",
      "virtua",
    ],
  },
});

export default config;
