export const PREMIUM_CREDITS = 100;
export const REMAINING_QUERY_ALERT_THRESHOLD = 2;
export const DAILY_FILE_UPLOAD_LIMIT = 5;

export const APP_NAME = "OS Chat";
export const META_TITLE = `${APP_NAME} - Open Source T3 Chat & ChatGPT Alternative`;
export const APP_DOMAIN = "https://oschat.ai";
export const APP_DESCRIPTION =
  "OS Chat is a free, open-source AI personal assistant with 40+ language models from OpenAI, Anthropic, Google, Meta, and more. Features background agents, service connectors (Gmail, Calendar, Notion, GitHub, Slack), multi-modal support, image generation, reasoning models, and web search in one powerful interface.";
export const APP_BASE_URL = process.env.VITE_APP_URL ?? "http://localhost:3000";

export const MODEL_DEFAULT = "gpt-5.4-nano";

export const RECOMMENDED_MODELS = [
  "gpt-5.4-nano",
  "openrouter/free",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "claude-sonnet-5",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "x-ai/grok-4.20",
  "deepseek/deepseek-v4-pro",
  "minimax/minimax-m3",
  "gpt-image-2",
  "nano-banana-2",
  "flux-2-pro",
];

export const MESSAGE_MAX_LENGTH = 4000;

export const GITHUB_REPO_URL = "https://github.com/ajanraj/OpenChat";
