/**
 * Provider-specific error detection utility for streaming responses
 * Detects error patterns embedded in streaming content from various AI providers
 */

export interface DetectedError {
  type: string;
  provider: string;
  message: string;
  userFriendlyMessage: string;
  isRateLimit?: boolean;
  isQuotaExceeded?: boolean;
  isInsufficientBalance?: boolean;
  isAuthError?: boolean;
}

/**
 * Detects provider-specific error patterns in streaming text content
 */
export function detectProviderErrorInText(text: string, provider: string): DetectedError | null {
  if (!(text && provider)) {
    return null;
  }

  const lowercaseText = text.toLowerCase();
  let detectedError: DetectedError | null = null;

  switch (provider) {
    case "openai":
      detectedError = detectOpenAIErrors(text, lowercaseText);
      break;
    case "anthropic":
      detectedError = detectAnthropicErrors(text, lowercaseText);
      break;
    case "google":
      detectedError = detectGoogleErrors(text, lowercaseText);
      break;
    case "xai":
      detectedError = detectXAIErrors(text, lowercaseText);
      break;
    case "deepseek":
      detectedError = detectDeepSeekErrors(text, lowercaseText);
      break;
    case "mistral":
      detectedError = detectMistralErrors(text, lowercaseText);
      break;
    case "openrouter":
      detectedError = detectOpenRouterErrors(text, lowercaseText);
      break;
    case "meta":
      detectedError = detectMetaErrors(text, lowercaseText);
      break;
    case "qwen":
      detectedError = detectQwenErrors(text, lowercaseText);
      break;
    case "moonshot":
      detectedError = detectMoonshotErrors(text, lowercaseText);
      break;
    case "zhipuai":
      detectedError = detectZhipuAIErrors(text, lowercaseText);
      break;
    case "fal":
      detectedError = detectFalErrors(text, lowercaseText);
      break;
    default:
      detectedError = null;
      break;
  }

  if (detectedError) {
    return detectedError;
  }

  return detectGenericErrors(text, lowercaseText, provider);
}

/**
 * OpenAI error patterns
 */
function detectOpenAIErrors(text: string, lowercaseText: string): DetectedError | null {
  // Quota exceeded errors
  if (
    lowercaseText.includes("exceeded your current quota") ||
    lowercaseText.includes("quota exceeded") ||
    lowercaseText.includes("insufficient quota")
  ) {
    return {
      type: "QUOTA_EXCEEDED",
      provider: "openai",
      message: text,
      userFriendlyMessage:
        "Your OpenAI quota has been exceeded. Please check your billing details or add credits to your account.",
      isQuotaExceeded: true,
    };
  }

  // Rate limit errors
  if (
    lowercaseText.includes("rate limit reached") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("rate_limit_exceeded")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "openai",
      message: text,
      userFriendlyMessage: "OpenAI rate limit reached. Please wait a moment before trying again.",
      isRateLimit: true,
    };
  }

  // Authentication errors
  if (
    lowercaseText.includes("invalid api key") ||
    lowercaseText.includes("api key not valid") ||
    lowercaseText.includes("unauthorized") ||
    lowercaseText.includes("authentication failed")
  ) {
    return {
      type: "AUTH_ERROR",
      provider: "openai",
      message: text,
      userFriendlyMessage: "Invalid OpenAI API key. Please check your API key in settings.",
      isAuthError: true,
    };
  }

  return null;
}

/**
 * Anthropic (Claude) error patterns
 */
function detectAnthropicErrors(text: string, lowercaseText: string): DetectedError | null {
  // Insufficient credits/balance
  if (
    lowercaseText.includes("insufficient credits") ||
    lowercaseText.includes("credit balance is too low") ||
    lowercaseText.includes("balance too low") ||
    lowercaseText.includes("usage is blocked due to insufficient credits")
  ) {
    return {
      type: "INSUFFICIENT_BALANCE",
      provider: "anthropic",
      message: text,
      userFriendlyMessage:
        "Insufficient Claude API credits. Please visit Plans & Billing to add credits.",
      isInsufficientBalance: true,
    };
  }

  // Rate limit errors
  if (
    lowercaseText.includes("rate limit exceeded") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "anthropic",
      message: text,
      userFriendlyMessage: "Claude API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  // Authentication errors
  if (
    lowercaseText.includes("invalid api key") ||
    lowercaseText.includes("unauthorized") ||
    lowercaseText.includes("authentication failed")
  ) {
    return {
      type: "AUTH_ERROR",
      provider: "anthropic",
      message: text,
      userFriendlyMessage: "Invalid Claude API key. Please check your API key in settings.",
      isAuthError: true,
    };
  }

  return null;
}

/**
 * Google (Gemini) error patterns
 */
function detectGoogleErrors(text: string, lowercaseText: string): DetectedError | null {
  // Resource exhausted (quota/rate limit)
  if (
    lowercaseText.includes("resource_exhausted") ||
    lowercaseText.includes("quota exceeded") ||
    lowercaseText.includes("requests per minute")
  ) {
    return {
      type: "QUOTA_EXCEEDED",
      provider: "google",
      message: text,
      userFriendlyMessage:
        "Google Gemini quota exceeded. Consider upgrading your plan or waiting before retrying.",
      isQuotaExceeded: true,
    };
  }

  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "google",
      message: text,
      userFriendlyMessage: "Google Gemini rate limit reached. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  // Authentication errors
  if (
    lowercaseText.includes("invalid api key") ||
    lowercaseText.includes("api key not valid") ||
    lowercaseText.includes("unauthorized") ||
    lowercaseText.includes("authentication failed")
  ) {
    return {
      type: "AUTH_ERROR",
      provider: "google",
      message: text,
      userFriendlyMessage: "Invalid Google API key. Please check your API key in settings.",
      isAuthError: true,
    };
  }

  return null;
}

/**
 * xAI (Grok) error patterns
 */
function detectXAIErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "xai",
      message: text,
      userFriendlyMessage: "Grok API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  // Authentication errors
  if (
    lowercaseText.includes("invalid api key") ||
    lowercaseText.includes("unauthorized") ||
    lowercaseText.includes("401")
  ) {
    return {
      type: "AUTH_ERROR",
      provider: "xai",
      message: text,
      userFriendlyMessage: "Invalid xAI API key. Please check your API key in settings.",
      isAuthError: true,
    };
  }

  return null;
}

/**
 * DeepSeek error patterns
 */
function detectDeepSeekErrors(text: string, lowercaseText: string): DetectedError | null {
  // Timeout/throttling errors
  if (
    lowercaseText.includes("timeout") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("throttled") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "deepseek",
      message: text,
      userFriendlyMessage: "DeepSeek API is experiencing high load. Please try again in a moment.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * Mistral error patterns
 */
function detectMistralErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("rate limit exceeded") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("workspace level") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "mistral",
      message: text,
      userFriendlyMessage: "Mistral API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * OpenRouter error patterns
 */
function detectOpenRouterErrors(text: string, lowercaseText: string): DetectedError | null {
  // Credit balance errors
  if (
    lowercaseText.includes("negative credit balance") ||
    lowercaseText.includes("402") ||
    lowercaseText.includes("insufficient credits")
  ) {
    return {
      type: "INSUFFICIENT_BALANCE",
      provider: "openrouter",
      message: text,
      userFriendlyMessage: "OpenRouter credit balance is low. Please add credits to your account.",
      isInsufficientBalance: true,
    };
  }

  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "openrouter",
      message: text,
      userFriendlyMessage: "OpenRouter rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * Meta error patterns
 */
function detectMetaErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "meta",
      message: text,
      userFriendlyMessage: "Meta Llama API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * Qwen error patterns
 */
function detectQwenErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "qwen",
      message: text,
      userFriendlyMessage: "Qwen API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * Moonshot error patterns
 */
function detectMoonshotErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "moonshot",
      message: text,
      userFriendlyMessage: "Moonshot API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * ZhipuAI (GLM) error patterns
 */
function detectZhipuAIErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "zhipuai",
      message: text,
      userFriendlyMessage: "GLM API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * Fal error patterns
 */
function detectFalErrors(text: string, lowercaseText: string): DetectedError | null {
  // Rate limit errors
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider: "fal",
      message: text,
      userFriendlyMessage: "Fal API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  return null;
}

/**
 * Generic error patterns for unknown providers
 */
function detectGenericErrors(
  text: string,
  lowercaseText: string,
  provider: string,
): DetectedError | null {
  // Generic rate limit patterns
  if (
    lowercaseText.includes("rate limit") ||
    lowercaseText.includes("too many requests") ||
    lowercaseText.includes("429")
  ) {
    return {
      type: "RATE_LIMIT",
      provider,
      message: text,
      userFriendlyMessage: "API rate limit exceeded. Please wait before trying again.",
      isRateLimit: true,
    };
  }

  // Generic quota patterns
  if (
    lowercaseText.includes("quota exceeded") ||
    lowercaseText.includes("quota exhausted") ||
    lowercaseText.includes("usage limit")
  ) {
    return {
      type: "QUOTA_EXCEEDED",
      provider,
      message: text,
      userFriendlyMessage: "API quota exceeded. Please check your plan or wait before retrying.",
      isQuotaExceeded: true,
    };
  }

  // Generic auth patterns
  if (
    lowercaseText.includes("unauthorized") ||
    lowercaseText.includes("invalid api key") ||
    lowercaseText.includes("api key not valid") ||
    lowercaseText.includes("authentication failed") ||
    lowercaseText.includes("401")
  ) {
    return {
      type: "AUTH_ERROR",
      provider,
      message: text,
      userFriendlyMessage: "Invalid API key. Please check your API key in settings.",
      isAuthError: true,
    };
  }

  return null;
}

/**
 * Detects errors in error objects that might contain provider-specific information
 */
export function detectProviderErrorFromObject(
  error: unknown,
  provider: string,
): DetectedError | null {
  if (!(error && provider)) {
    return null;
  }

  let errorText = "";

  if (typeof error === "string") {
    errorText = error;
  } else if (error instanceof Error) {
    errorText = error.message;
  } else if (typeof error === "object" && "message" in error) {
    errorText = String(error.message);
  } else {
    errorText = "";
  }

  return detectProviderErrorInText(errorText, provider);
}

/**
 * Determines if a detected error should trigger API key fallback
 */
export function shouldTriggerFallback(detectedError: DetectedError): boolean {
  return (
    Boolean(detectedError.isAuthError) ||
    Boolean(detectedError.isInsufficientBalance) ||
    Boolean(detectedError.isQuotaExceeded)
  );
}
