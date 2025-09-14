// Re-export everything from the refactored config structure
// This file maintains backward compatibility while the actual config is now organized in separate modules

// Constants
// biome-ignore lint/performance/noBarrelFile: This file maintains backward compatibility for existing imports
export * from "./config/constants";
// Features
export * from "./config/features";
// Models (main exports)
export * from "./config/models/index";
// lib/config.ts

// Providers
export * from "./config/providers";
// Schemas and types
export * from "./config/schemas";
export * from "./config/schemas";
// Suggestions
export * from "./config/suggestions";
