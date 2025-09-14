import { TOOL_CALLING_FEATURE } from "../features";
import { openrouter } from "../openrouter";

export const MOONSHOT_MODELS = [
  {
    id: "moonshotai/kimi-k2-0711",
    name: "Kimi K2",
    subName: "0711",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: true,
    usesPremiumCredits: false,
    description: `Moonshot AI's Kimi K2 model.\nOffers agentic tools capabilities for various tasks.`,
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: openrouter("moonshotai/kimi-k2:nitro"),
  },
  {
    id: "moonshotai/kimi-k2-0905",
    name: "Kimi K2",
    subName: "0905",
    provider: "openrouter",
    displayProvider: "moonshotai",
    premium: false,
    usesPremiumCredits: false,
    description:
      "Kimi K2 0905 is the September update of Kimi K2 model. \nThis update improves agentic coding with higher accuracy and frontend coding with more aesthetic and functional outputs for web, 3D, and related tasks.",
    apiKeyUsage: { allowUserKey: false, userKeyOnly: false },
    features: [TOOL_CALLING_FEATURE],
    api_sdk: openrouter("moonshotai/kimi-k2-0905:nitro"),
  },
];
