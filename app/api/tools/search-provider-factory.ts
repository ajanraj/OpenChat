import { BraveSearchProvider } from "./providers/brave-search";
import { ExaSearchProvider } from "./providers/exa-search";
import { TavilySearchProvider } from "./providers/tavily-search";
import {
  SEARCH_CONFIG,
  type SearchAdapter,
  type SearchOptions,
  type SearchProvider,
  type SearchResult,
} from "./types";

// Cache for provider instances
const instances: Map<SearchProvider, SearchAdapter> = new Map();

export function getProvider(provider?: SearchProvider): SearchAdapter {
  const selectedProvider = provider || SEARCH_CONFIG.defaultProvider;

  // Check if we already have an instance
  const existingInstance = instances.get(selectedProvider);
  if (existingInstance) {
    return existingInstance;
  }

  // Create new instance based on provider type
  let instance: SearchAdapter;

  switch (selectedProvider) {
    case "brave": {
      const braveKey = process.env.BRAVE_API_KEY;
      if (!braveKey) {
        throw new Error("BRAVE_API_KEY environment variable is not set");
      }
      instance = new BraveSearchProvider(braveKey);
      break;
    }

    case "tavily": {
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (!tavilyKey) {
        throw new Error("TAVILY_API_KEY environment variable is not set");
      }
      instance = new TavilySearchProvider(tavilyKey);
      break;
    }

    case "exa": {
      const exaKey = process.env.EXA_API_KEY;
      if (!exaKey) {
        throw new Error("EXA_API_KEY environment variable is not set");
      }
      instance = new ExaSearchProvider(exaKey);
      break;
    }

    default:
      throw new Error(`Unknown search provider: ${selectedProvider}`);
  }

  // Cache the instance
  instances.set(selectedProvider, instance);
  return instance;
}

export async function searchWithFallback(
  query: string,
  options?: SearchOptions,
  providers?: SearchProvider[]
): Promise<SearchResult[]> {
  // If no providers specified, create a smart fallback order starting with default
  const providersToTry =
    providers ||
    (() => {
      const defaultProvider = SEARCH_CONFIG.defaultProvider;
      const allProviders: SearchProvider[] = ["brave", "tavily", "exa"];

      // Start with default provider, then add others
      return [
        defaultProvider,
        ...allProviders.filter((p) => p !== defaultProvider),
      ];
    })();

  // Try each provider sequentially until one succeeds
  const tryProvider = async (
    providerIndex: number
  ): Promise<SearchResult[]> => {
    if (providerIndex >= providersToTry.length) {
      throw new Error("All search providers failed");
    }

    const provider = providersToTry[providerIndex];

    try {
      // Check if API key exists before attempting to create provider
      const hasApiKey = hasApiKeyForProvider(provider);
      if (!hasApiKey) {
        return await tryProvider(providerIndex + 1);
      }

      const adapter = getProvider(provider);
      return await adapter.search(query, options);
    } catch (error) {
      // If this is the last provider, throw the error
      if (providerIndex === providersToTry.length - 1) {
        throw new Error(
          `All search providers failed. Last error: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      // Otherwise, try the next provider
      return await tryProvider(providerIndex + 1);
    }
  };

  return await tryProvider(0);
}

function hasApiKeyForProvider(provider: SearchProvider): boolean {
  switch (provider) {
    case "brave":
      return Boolean(process.env.BRAVE_API_KEY);
    case "tavily":
      return Boolean(process.env.TAVILY_API_KEY);
    case "exa":
      return Boolean(process.env.EXA_API_KEY);
    default:
      return false;
  }
}
