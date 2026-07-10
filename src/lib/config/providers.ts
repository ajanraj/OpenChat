import {
  AnthropicDark,
  AnthropicLight,
  DeepSeek,
  Gemini,
  GrokDark,
  GrokLight,
  Meta,
  MistralAI,
  OpenAIDark,
  OpenAILight,
  OpenRouterDark,
  OpenRouterLight,
  QwenDark,
  QwenLight,
} from "@ridemountainpig/svgl-react";
import { FluxIcon, KimiIcon, MinimaxIcon, ZAIIcon } from "@/components/icons/provider-brand-icons";

export interface Provider {
  id: string;
  name: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  icon_light?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export const PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: DeepSeek,
  },
  {
    id: "fal",
    name: "Fal.ai",
    icon: FluxIcon,
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: Gemini,
  },
  {
    id: "xai",
    name: "xAI",
    icon: GrokDark,
    icon_light: GrokLight,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: OpenRouterDark,
    icon_light: OpenRouterLight,
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: OpenAIDark,
    icon_light: OpenAILight,
  },
  {
    id: "anthropic",
    name: "Claude",
    icon: AnthropicDark,
    icon_light: AnthropicLight,
  },
  {
    id: "mistral",
    name: "Mistral",
    icon: MistralAI,
  },
  {
    id: "meta",
    name: "Meta",
    icon: Meta,
  },
  {
    id: "qwen",
    name: "Qwen",
    icon: QwenDark,
    icon_light: QwenLight,
  },
  {
    id: "moonshotai",
    name: "Moonshot AI",
    icon: KimiIcon,
  },
  {
    id: "z-ai",
    name: "Z.AI",
    icon: ZAIIcon,
  },
  {
    id: "minimax",
    name: "MiniMax",
    icon: MinimaxIcon,
  },
] as Provider[];

export { PROVIDERS as PROVIDERS_OPTIONS };
