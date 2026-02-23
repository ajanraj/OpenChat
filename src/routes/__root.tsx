// Inline script to prevent theme flash - runs before React hydration
// This reads from the Zustand persisted store and applies the dark class and CSS variables immediately

import type { QueryClient } from "@tanstack/react-query";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import LayoutApp from "@/components/layout/layout-app";
import { StructuredData } from "@/components/structured-data";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_BASE_URL, APP_DESCRIPTION, APP_NAME, META_TITLE } from "@/lib/config";
import { SidebarProvider } from "@/providers/sidebar-provider";
import { LazyMotion, domMax } from "motion/react";
import { ConvexProvider } from "../integrations/convex/provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

// Import fonts
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";

const appStorageVersion = import.meta.env.VITE_STORAGE_VERSION ?? "2026-01-03";
const appStorageVersionKey = "oschat:storage:version";

const themeInitScript = `
(function() {
  try {
    var storageVersionKey = ${JSON.stringify(appStorageVersionKey)};
    var storageVersion = ${JSON.stringify(appStorageVersion)};
    var storedVersion = localStorage.getItem(storageVersionKey);
    if (storedVersion !== storageVersion) {
      localStorage.clear();
      localStorage.setItem(storageVersionKey, storageVersion);
    }
  } catch (e) {
    // Ignore storage errors (blocked, private mode, etc.)
  }
  try {
    var stored = localStorage.getItem('editor-storage');
    if (stored) {
      var parsed = JSON.parse(stored);
      var themeState = parsed && parsed.state && parsed.state.themeState;
      var mode = themeState && themeState.currentMode;
      var styles = themeState && themeState.styles;
      
      // Determine effective mode
      var effectiveMode = mode;
      if (!effectiveMode || (effectiveMode !== 'dark' && effectiveMode !== 'light')) {
        effectiveMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
      }
      
      // Apply dark class
      if (effectiveMode === 'dark') {
        document.documentElement.classList.add('dark');
      }
      
      // Apply CSS variables from stored theme
      if (styles && styles[effectiveMode]) {
        var modeStyles = styles[effectiveMode];
        for (var key in modeStyles) {
          if (modeStyles.hasOwnProperty(key) && typeof modeStyles[key] === 'string') {
            document.documentElement.style.setProperty('--' + key, modeStyles[key]);
          }
        }
        // Also apply common styles from light mode (fonts, radius, etc)
        if (effectiveMode === 'dark' && styles.light) {
          var commonKeys = ['font-sans', 'font-mono', 'radius', 'shadow-opacity', 'shadow-blur', 'shadow-spread', 'shadow-offset-x', 'shadow-offset-y', 'letter-spacing', 'spacing'];
          for (var i = 0; i < commonKeys.length; i++) {
            var ck = commonKeys[i];
            if (styles.light[ck] && typeof styles.light[ck] === 'string') {
              document.documentElement.style.setProperty('--' + ck, styles.light[ck]);
            }
          }
        }
      }
    } else {
      // No stored preference, use system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    }
  } catch (e) {
    // Fallback: just apply system preference for dark class
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }
})();
`;

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: META_TITLE,
      },
      {
        name: "description",
        content: APP_DESCRIPTION,
      },
      {
        property: "og:title",
        content: META_TITLE,
      },
      {
        property: "og:description",
        content: APP_DESCRIPTION,
      },
      {
        property: "og:url",
        content: APP_BASE_URL,
      },
      {
        property: "og:site_name",
        content: APP_NAME,
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:image",
        content: "https://assets.oschat.ai/oc-opengraph-image.png",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: META_TITLE,
      },
      {
        name: "twitter:description",
        content: APP_DESCRIPTION,
      },
      {
        name: "twitter:image",
        content: "https://assets.oschat.ai/oc-opengraph-image.png",
      },
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "OS Chat",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-icon.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),

  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const isDev = import.meta.env.DEV;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Theme initialization script - prevents flash of wrong theme */}
        <script>{themeInitScript}</script>
        <HeadContent />
        {/* Umami Analytics - only in production when configured */}
        {!isDev &&
          import.meta.env.VITE_UMAMI_SCRIPT_URL &&
          import.meta.env.VITE_UMAMI_WEBSITE_ID && (
            <script
              data-website-id={import.meta.env.VITE_UMAMI_WEBSITE_ID}
              defer
              src={import.meta.env.VITE_UMAMI_SCRIPT_URL}
            />
          )}
        <StructuredData type="homepage" />
      </head>
      <body className="font-sans antialiased">
        <LazyMotion features={domMax}>
          <ConvexProvider>
            <TooltipProvider>
              <AuthGuard>
                <SidebarProvider>
                  <LayoutApp>{children}</LayoutApp>
                </SidebarProvider>
                {/* Vercel Analytics */}
                <Analytics />
                <SpeedInsights />
              </AuthGuard>
            </TooltipProvider>
            {isDev === true && (
              <TanStackDevtools
                config={{
                  position: "bottom-right",
                }}
                plugins={[
                  {
                    name: "Tanstack Router",
                    render: <TanStackRouterDevtoolsPanel />,
                  },
                  TanStackQueryDevtools,
                ]}
              />
            )}
          </ConvexProvider>
        </LazyMotion>
        <Scripts />
      </body>
    </html>
  );
}
