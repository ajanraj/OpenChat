import type { ModelFeature, ReasoningEffort } from "./schemas";

// Feature definitions - these are the actual feature objects that models can include
export const FILE_UPLOAD_FEATURE = {
  id: "file-upload",
  enabled: true,
  label: "Supports file uploads",
};
export const PDF_PROCESSING_FEATURE = {
  id: "pdf-processing",
  enabled: true,
  label: "Supports PDF uploads and analysis",
};
const OPTIONAL_REASONING_EFFORTS: ReasoningEffort[] = ["none", "low", "medium", "high"];
const ALWAYS_REASONING_EFFORTS: ReasoningEffort[] = ["low", "medium", "high"];
const MAX_REASONING_EFFORTS: ReasoningEffort[] = ["xhigh", "high", "low"];
const TOGGLE_REASONING_EFFORTS: ReasoningEffort[] = ["none", "high"];

export const REASONING_FEATURE = {
  id: "reasoning",
  enabled: true,
  effortOptions: OPTIONAL_REASONING_EFFORTS,
  label: "Supports reasoning capabilities",
} satisfies ModelFeature;
export const REASONING_FEATURE_ALWAYS = {
  id: "reasoning",
  enabled: true,
  effortOptions: ALWAYS_REASONING_EFFORTS,
  label: "Supports reasoning capabilities",
} satisfies ModelFeature;
export const REASONING_FEATURE_MAX = {
  id: "reasoning",
  enabled: true,
  effortOptions: MAX_REASONING_EFFORTS,
  label: "Supports reasoning capabilities",
} satisfies ModelFeature;
export const REASONING_FEATURE_TOGGLE = {
  id: "reasoning",
  enabled: true,
  effortOptions: TOGGLE_REASONING_EFFORTS,
  label: "Supports reasoning capabilities",
} satisfies ModelFeature;
export const REASONING_FEATURE_FIXED = {
  id: "reasoning",
  enabled: true,
  label: "Supports reasoning capabilities",
} satisfies ModelFeature;
export const REASONING_FEATURE_BASIC = REASONING_FEATURE_FIXED;
export const REASONING_FEATURE_DISABLED = {
  id: "reasoning",
  enabled: false,
  label: "Supports reasoning capabilities",
} satisfies ModelFeature;
export const IMAGE_GENERATION_FEATURE = {
  id: "image-generation",
  enabled: true,
  label: "Generates images from text prompts",
};
export const TOOL_CALLING_FEATURE = {
  id: "tool-calling",
  enabled: true,
  label: "Supports tool calling (web search & connectors)",
};
