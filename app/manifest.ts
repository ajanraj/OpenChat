import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Os Chat",
    short_name: "Os Chat",
    description:
      "Your AI Personal Assistant: Chat with multiple AI models, switch between them instantly, and get the best responses with background agents automation",
    start_url: ".",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["productivity", "utilities"],
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
  };
}
