import { Flux, Moonshot, ZAI } from "@lobehub/icons";
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

export type Provider = {
  id: string;
  name: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  icon_light?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export const PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: DeepSeek,
  },
  {
    id: "fal",
    name: "Fal.ai",
    icon: Flux,
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
    icon: Moonshot,
  },
  {
    id: "z-ai",
    name: "Z.AI",
    icon: ZAI,
  },
] as Provider[];

export const PROVIDERS_OPTIONS = PROVIDERS;
