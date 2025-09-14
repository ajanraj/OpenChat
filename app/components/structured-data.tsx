import { APP_BASE_URL, APP_DESCRIPTION, APP_NAME } from "@/lib/config";

type StructuredDataProps = {
  type?: "homepage" | "page";
  title?: string;
  description?: string;
  url?: string;
};

export function StructuredData({
  type = "homepage",
  title,
  description,
  url,
}: StructuredDataProps = {}) {
  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    alternateName: ["oschat", "oschat.ai", "Open Chat", "oschat ai"],
    description:
      description ||
      "OS Chat is a free, open-source AI personal assistant and T3 Chat alternative with 40+ language models, background agents, and service integrations.",
    url: url || APP_BASE_URL,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    softwareVersion: "1.0.0",
    datePublished: "2024-01-01",
    dateModified: new Date().toISOString().split("T")[0],
    inLanguage: "en-US",
    isAccessibleForFree: true,
    offers: [
      {
        "@type": "Offer",
        name: "Free Plan",
        description: "Access to basic AI models and features",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        validFrom: "2024-01-01",
      },
      {
        "@type": "Offer",
        name: "Pro Plan",
        description:
          "Access to all AI models, advanced features, background agents, and service integrations",
        price: "10",
        priceCurrency: "USD",
        billingIncrement: "MONTHLY",
        availability: "https://schema.org/InStock",
        validFrom: "2024-01-01",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
      bestRating: "5",
      worstRating: "4.5",
    },
    featureList: [
      "40+ AI Models (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek)",
      "Background Agent Scheduling & Automation",
      "Gmail & Calendar Integration",
      "Notion & GitHub Integration",
      "Web Search Capabilities",
      "Image Generation",
      "Multi-modal Support",
      "Reasoning Models (o1)",
      "Real-time Collaboration",
      "Open Source & Self-hostable",
    ],
    applicationSubCategory: "AI Assistant, Productivity Tool, Chat Application",
    keywords: [
      "AI chat",
      "ChatGPT alternative",
      "T3 Chat alternative",
      "open source AI",
      "AI personal assistant",
      "background agents",
      "multi-model AI",
    ],
    creator: {
      "@type": "Organization",
      name: "OS Chat Team",
      url: APP_BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "OS Chat",
      url: APP_BASE_URL,
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "OS Chat",
    alternateName: ["oschat", "oschat.ai"],
    url: APP_BASE_URL,
    description:
      "Open-source AI personal assistant platform providing access to multiple AI models with background agents and service integrations.",
    foundingDate: "2024",
    sameAs: ["https://github.com/ajanraj/OpenChat"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${APP_BASE_URL}/settings/contact`,
    },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title || APP_NAME,
    alternateName: ["oschat", "oschat.ai", "Open Chat"],
    url: url || APP_BASE_URL,
    description: description || APP_DESCRIPTION,
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${APP_BASE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
    publisher: {
      "@type": "Organization",
      name: "OS Chat",
      url: APP_BASE_URL,
    },
  };

  // Combine all schemas into a single array for better structure
  const combinedSchema = [
    softwareApplicationSchema,
    organizationSchema,
    ...(type === "homepage" ? [websiteSchema] : []),
  ];

  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for JSON-LD structured data per Next.js documentation
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(combinedSchema, null, 0).replace(
          /</g,
          "\\u003c"
        ),
      }}
      type="application/ld+json"
    />
  );
}
