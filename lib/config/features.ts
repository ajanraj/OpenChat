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
export const REASONING_FEATURE = {
  id: "reasoning",
  enabled: true,
  supportsEffort: true,
  label: "Supports reasoning capabilities",
};
export const REASONING_FEATURE_BASIC = {
  id: "reasoning",
  enabled: true,
  supportsEffort: false,
  label: "Supports reasoning capabilities",
};
export const REASONING_FEATURE_DISABLED = {
  id: "reasoning",
  enabled: false,
  label: "Supports reasoning capabilities",
};
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
