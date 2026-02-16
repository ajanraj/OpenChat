import { describe, expect, it } from "vitest";
import {
  HOTKEY_EVENT_OPEN_MODEL_PICKER,
  HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT,
  isChatRoute,
  isCurrentChatRoute,
  isInputLikeTarget,
} from "../hotkey-events";

describe("hotkey-events", () => {
  it("exports stable event names", () => {
    expect(HOTKEY_EVENT_OPEN_MODEL_PICKER).toBe("openModelPicker");
    expect(HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT).toBe("requestDeleteCurrentChat");
  });
});

describe("isChatRoute", () => {
  it("returns true for chat root and chat detail routes", () => {
    expect(isChatRoute("/")).toBe(true);
    expect(isChatRoute("/c/abc123")).toBe(true);
  });

  it("returns false for non-chat routes", () => {
    expect(isChatRoute("/settings")).toBe(false);
    expect(isChatRoute("/tasks")).toBe(false);
    expect(isChatRoute(undefined)).toBe(false);
  });
});

describe("isCurrentChatRoute", () => {
  it("returns true only for existing chat routes", () => {
    expect(isCurrentChatRoute("/c/abc123")).toBe(true);
    expect(isCurrentChatRoute("/")).toBe(false);
    expect(isCurrentChatRoute("/settings")).toBe(false);
  });
});

describe("isInputLikeTarget", () => {
  it("returns true for input-like elements", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.setAttribute("contenteditable", "true");

    expect(isInputLikeTarget(input)).toBe(true);
    expect(isInputLikeTarget(textarea)).toBe(true);
    expect(isInputLikeTarget(editable)).toBe(true);
  });

  it("returns false for non-input targets", () => {
    const button = document.createElement("button");
    expect(isInputLikeTarget(button)).toBe(false);
    expect(isInputLikeTarget(window)).toBe(false);
    expect(isInputLikeTarget(null)).toBe(false);
  });
});
