import { useCallback, useEffect, useState } from "react";

export function useNavigationGuard(hasUnsavedChanges: boolean) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const shouldInterceptAnchor = useCallback((anchor: HTMLAnchorElement): string | null => {
    if (!anchor.href || anchor.target === "_blank") return null;
    const url = anchor.getAttribute("href") || anchor.href;
    return url?.startsWith("/") ? url : null;
  }, []);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) return;
      if (!(e.target instanceof Element)) return;
      const anchor = e.target.closest("a");
      if (!anchor) return;
      const url = shouldInterceptAnchor(anchor);
      if (url) {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setTimeout(() => setPendingUrl(url), 0);
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedChanges, shouldInterceptAnchor]);

  return { pendingUrl, setPendingUrl };
}
