export const HOTKEY_EVENT_OPEN_MODEL_PICKER = "openModelPicker";
export const HOTKEY_EVENT_REQUEST_DELETE_CURRENT_CHAT =
  "requestDeleteCurrentChat";

export const isInputLikeTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const { tagName } = target;
  const contentEditableAttr = target.getAttribute("contenteditable");
  const contentEditableValue = target.contentEditable;
  const isEditable =
    target.isContentEditable ||
    contentEditableValue === "true" ||
    contentEditableAttr === "" ||
    contentEditableAttr === "true";
  return tagName === "INPUT" || tagName === "TEXTAREA" || isEditable;
};

export const isChatRoute = (pathname?: string): boolean =>
  pathname === "/" || pathname?.startsWith("/c/") === true;

export const isCurrentChatRoute = (pathname?: string): boolean =>
  pathname?.startsWith("/c/") === true;
