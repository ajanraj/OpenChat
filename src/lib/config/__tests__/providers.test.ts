import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FluxIcon, KimiIcon, MinimaxIcon, ZAIIcon } from "@/components/icons/provider-brand-icons";
import { PROVIDERS, PROVIDERS_OPTIONS } from "../providers";

const providerIconMappings = [
  { icon: FluxIcon, id: "fal" },
  { icon: KimiIcon, id: "moonshotai" },
  { icon: ZAIIcon, id: "z-ai" },
  { icon: MinimaxIcon, id: "minimax" },
] as const;

const localProviderIcons = [
  { icon: FluxIcon, title: "Flux" },
  { icon: KimiIcon, title: "Kimi" },
  { icon: MinimaxIcon, title: "Minimax" },
  { icon: ZAIIcon, title: "Z.ai" },
] as const;

describe("Providers Config", () => {
  describe("PROVIDERS array", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(PROVIDERS)).toBe(true);
      expect(PROVIDERS.length).toBeGreaterThan(0);
    });

    it("each provider has required properties", () => {
      for (const provider of PROVIDERS) {
        expect(provider.id).toBeDefined();
        expect(typeof provider.id).toBe("string");
        expect(provider.id.length).toBeGreaterThan(0);

        expect(provider.name).toBeDefined();
        expect(typeof provider.name).toBe("string");
        expect(provider.name.length).toBeGreaterThan(0);

        expect(provider.icon).toBeDefined();
      }
    });

    it("provider ids are unique", () => {
      const ids = PROVIDERS.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("contains major AI providers", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("openai");
      expect(ids).toContain("anthropic");
      expect(ids).toContain("gemini");
    });

    it("contains DeepSeek provider", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("deepseek");
    });

    it("contains xAI provider", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("xai");
    });

    it("contains OpenRouter provider", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("openrouter");
    });

    it("contains Meta provider", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("meta");
    });

    it("contains Mistral provider", () => {
      const ids = PROVIDERS.map((p) => p.id);
      expect(ids).toContain("mistral");
    });
  });

  describe("Provider icon variations", () => {
    it.each(providerIconMappings)("uses the expected icon for $id", ({ icon, id }) => {
      expect(PROVIDERS.find((provider) => provider.id === id)?.icon).toBe(icon);
    });

    it.each(localProviderIcons)("renders the local $title icon", ({ icon, title }) => {
      const { container } = render(createElement(icon, { className: "size-5" }));
      const svg = container.querySelector("svg");

      expect(svg?.getAttribute("class")).toBe("size-5");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg?.querySelector("title")?.textContent).toBe(title);
    });

    it("renders Kimi without an opaque app-tile background", () => {
      const { container } = render(createElement(KimiIcon, { className: "size-5" }));
      const svg = container.querySelector("svg");

      expect(svg?.querySelectorAll("path")).toHaveLength(2);
      expect(svg?.querySelector('path[fill="currentColor"]')).not.toBeNull();
      expect(svg?.querySelector("path:not([fill])")).toBeNull();
    });

    it("some providers have light icon variant", () => {
      const providersWithLightIcon = PROVIDERS.filter((p) => p.icon_light);
      expect(providersWithLightIcon.length).toBeGreaterThan(0);
    });

    it("openai has light icon variant", () => {
      const openai = PROVIDERS.find((p) => p.id === "openai");
      expect(openai?.icon_light).toBeDefined();
    });

    it("anthropic has light icon variant", () => {
      const anthropic = PROVIDERS.find((p) => p.id === "anthropic");
      expect(anthropic?.icon_light).toBeDefined();
    });

    it("xai has light icon variant", () => {
      const xai = PROVIDERS.find((p) => p.id === "xai");
      expect(xai?.icon_light).toBeDefined();
    });
  });

  describe("PROVIDERS_OPTIONS", () => {
    it("is the same as PROVIDERS", () => {
      expect(PROVIDERS_OPTIONS).toBe(PROVIDERS);
    });
  });
});
