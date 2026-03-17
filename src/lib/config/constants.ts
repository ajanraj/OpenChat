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
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-pro-preview",
  "imagen-4",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "x-ai/grok-4.1-fast",
  "gpt-image-1.5",
  "claude-4-6-sonnet",
  "claude-4-6-sonnet-reasoning",
  "deepseek-r1-0528",
];

export const MESSAGE_MAX_LENGTH = 4000;

export const GITHUB_REPO_URL = "https://github.com/ajanraj/OpenChat";
