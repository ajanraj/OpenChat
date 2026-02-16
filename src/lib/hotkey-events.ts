export const HOTKEY_EVENT_OPEN_MODEL_PICKER = "openModelPicker";
export const HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT = "requestDeleteCurrentChat";

export function isInputLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  const contentEditableAttr = target.getAttribute("contenteditable");
  const contentEditableValue = target.contentEditable;
  const isEditable =
    target.isContentEditable === true ||
    contentEditableValue === "true" ||
    contentEditableAttr === "" ||
    contentEditableAttr === "true";
  return tagName === "INPUT" || tagName === "TEXTAREA" || isEditable;
}

export function isChatRoute(pathname: string | undefined): boolean {
  return pathname === "/" || pathname?.startsWith("/c/") === true;
}

export function isCurrentChatRoute(pathname: string | undefined): boolean {
  return pathname?.startsWith("/c/") === true;
}
