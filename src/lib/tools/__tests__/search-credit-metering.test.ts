import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeOneStandardCreditForSearch,
  createMeteredSearchTool,
} from "../search-credit-metering";
import type { ConsumeStandardCredits } from "../search-credit-metering";

interface SearchToolOptions {
  onSearchSuccess?: () => Promise<void> | void;
}

const createSearchToolMock = vi.fn<(options?: SearchToolOptions) => object>();

vi.mock("../search", () => ({
  createSearchTool: (options?: SearchToolOptions) =>
    createSearchToolMock(options),
}));

describe("search-credit-metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSearchToolMock.mockReset();
    createSearchToolMock.mockReturnValue({ name: "search-tool" });
  });

  it("charges exactly one standard credit per search success callback", async () => {
    const consumeStandardCredits = vi
      .fn<ConsumeStandardCredits>()
      .mockResolvedValue(undefined);

    await consumeOneStandardCreditForSearch(consumeStandardCredits);

    expect(consumeStandardCredits).toHaveBeenCalledOnce();
    expect(consumeStandardCredits).toHaveBeenCalledWith(1);
  });

  it("propagates errors when credit consumption fails", async () => {
    const consumeStandardCredits = vi
      .fn<ConsumeStandardCredits>()
      .mockRejectedValue(new Error("billing unavailable"));

    await expect(
      consumeOneStandardCreditForSearch(consumeStandardCredits)
    ).rejects.toThrow("billing unavailable");
  });

  it("does not create a search tool when search is disabled", () => {
    const consumeStandardCredits = vi.fn<ConsumeStandardCredits>();

    const tool = createMeteredSearchTool({
      enableSearch: false,
      consumeStandardCredits,
    });

    expect(tool).toBeUndefined();
    expect(createSearchToolMock).not.toHaveBeenCalled();
  });

  it("wires search tool callback to consume one standard credit", async () => {
    const consumeStandardCredits = vi
      .fn<ConsumeStandardCredits>()
      .mockResolvedValue(undefined);

    createMeteredSearchTool({
      enableSearch: true,
      consumeStandardCredits,
    });

    expect(createSearchToolMock).toHaveBeenCalledOnce();
    const [options] = createSearchToolMock.mock.calls[0] ?? [];

    if (
      typeof options !== "object" ||
      options === null ||
      !("onSearchSuccess" in options) ||
      typeof options.onSearchSuccess !== "function"
    ) {
      throw new Error("onSearchSuccess callback not wired");
    }

    await options.onSearchSuccess();

    expect(consumeStandardCredits).toHaveBeenCalledOnce();
    expect(consumeStandardCredits).toHaveBeenCalledWith(1);
  });

  it("propagates errors through onSearchSuccess callback", async () => {
    const consumeStandardCredits = vi
      .fn<ConsumeStandardCredits>()
      .mockRejectedValue(new Error("billing unavailable"));

    createMeteredSearchTool({
      enableSearch: true,
      consumeStandardCredits,
    });

    expect(createSearchToolMock).toHaveBeenCalledOnce();
    const [options] = createSearchToolMock.mock.calls[0] ?? [];

    if (
      typeof options !== "object" ||
      options === null ||
      !("onSearchSuccess" in options) ||
      typeof options.onSearchSuccess !== "function"
    ) {
      throw new Error("onSearchSuccess callback not wired");
    }

    await expect(options.onSearchSuccess()).rejects.toThrow(
      "billing unavailable"
    );
    expect(consumeStandardCredits).toHaveBeenCalledOnce();
    expect(consumeStandardCredits).toHaveBeenCalledWith(1);
  });
});
