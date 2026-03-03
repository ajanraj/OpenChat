import { describe, expect, it } from "vitest";
import { MODELS_DATA } from "../../../src/lib/config/models";
import { FILE_UPLOAD_MODELS, supportsFileUploadModel } from "../fileUploadModels";

describe("File Upload Model Allowlist", () => {
  it("keeps Convex allowlist in sync with frontend file-upload feature flags", () => {
    const allowed = new Set<string>(FILE_UPLOAD_MODELS);
    const modelsWithFileUpload = MODELS_DATA.filter((model) =>
      model.features.some((feature) => feature.id === "file-upload" && feature.enabled),
    ).map((model) => model.id);

    const missingInConvex = modelsWithFileUpload.filter((modelId) => !allowed.has(modelId));
    expect(missingInConvex).toEqual([]);
  });

  it("returns false for unknown models", () => {
    expect(supportsFileUploadModel("non-existent-model")).toBe(false);
  });
});
