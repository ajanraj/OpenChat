import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  APP_BASE_URL,
  APP_DESCRIPTION,
  APP_NAME,
  META_TITLE,
} from "@/lib/config";
import { cn } from "@/lib/utils";
import { AuthGuard } from "./components/auth/auth-guard";
import LayoutApp from "./components/layout/layout-app";
import { StructuredData } from "./components/structured-data";
import { LayoutClient } from "./layout-client";
import { ConvexClientProvider } from "./providers/convex-client-provider";
import { SidebarProvider } from "./providers/sidebar-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Keep only default theme fonts globally to avoid preloading all fonts

export const metadata: Metadata = {
  title: META_TITLE,
  description: APP_DESCRIPTION,
  metadataBase: new URL(APP_BASE_URL),
  keywords: [
    "OpenChat",
    "Open Chat",
    "OS Chat",
    "oschat",
    "oschat.ai",
    "oschat ai",
    "T3 Chat alternative",
    "T3 Chat",
    "ChatGPT alternative",
    "uncovr.app alternative",
    "uncovr alternative",
    "Grok alternative",
    "GitHub Copilot alternative",
    "Copilot alternative",
    "Perplexity alternative",
    "Character.ai alternative",
    "Poe alternative",
    "You.com alternative",
    "AI chat",
    "AI personal assistant",
    "AI chat platform",
    "multi-AI platform",
    "AI model aggregator",
    "unified AI interface",
    "AI assistant dashboard",
    "AI model comparison tool",
    "open source AI chat",
    "free AI chat",
    "multi-model AI",
    "AI chat with multiple models",
    "switch between AI models",
    "compare AI responses",
    "AI assistant with background agents",
    "AI chat with integrations",
    "self-hosted AI chat",
    "privacy-focused AI chat",
    "Claude alternative",
    "Anthropic models",
    "OpenAI models",
    "Google Gemini",
    "background agents AI",
    "AI automation",
    "Gmail integration",
    "Notion AI",
    "GitHub AI assistant",
    "web search AI",
    "image generation",
    "reasoning models",
    "o1 models",
    "DeepSeek",
    "Mistral AI",
    "Meta Llama",
    "AI assistant",
    "productivity AI",
    "open source ChatGPT",
    "free ChatGPT alternative",
    "AI personal assistant with background agents",
    "multi-model AI chat application",
    "AI chat with Gmail integration",
    "open source T3 Chat alternative",
    "free AI personal assistant",
  ],
  creator: "OS Chat Team",
  publisher: "OS Chat",
  applicationName: APP_NAME,
  category: "Productivity Software",
  openGraph: {
    title: META_TITLE,
    description: APP_DESCRIPTION,
    url: APP_BASE_URL,
    siteName: APP_NAME,
    images: [
      {
        url: "https://assets.oschat.ai/oc-opengraph-image.png",
        width: 1200,
        height: 630,
        alt: APP_DESCRIPTION,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: META_TITLE,
    description: APP_DESCRIPTION,
    images: ["https://assets.oschat.ai/oc-opengraph-image.png"],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Os Chat",
  },
};

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <StructuredData type="homepage" />
      </head>
      <body
        className={cn(
          "font-sans antialiased",
          geistSans.variable,
          geistMono.variable
        )}
      >
        {!isDev &&
          process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL &&
          process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
            <Script
              data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
              src={process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL}
              strategy="afterInteractive"
            />
          )}
        <LayoutClient />
        <TooltipProvider>
          <ConvexAuthNextjsServerProvider>
            <ConvexClientProvider>
              <AuthGuard>
                <SidebarProvider>
                  <LayoutApp>{children}</LayoutApp>
                </SidebarProvider>
                <Analytics />
                <SpeedInsights />
              </AuthGuard>
            </ConvexClientProvider>
          </ConvexAuthNextjsServerProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
