import { useEffect, useRef } from "react";
import { APP_NAME } from "@/lib/config";

export function useDocumentTitle(chatTitle?: string, chatId?: string) {
  const previousTitleRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let newTitle: string;

    const appName = APP_NAME.trim();

    if (chatTitle) {
      newTitle = `${chatTitle} - ${appName}`;
    } else {
      newTitle = appName;
    }

    // Only update if the title actually changed
    if (previousTitleRef.current !== newTitle) {
      document.title = newTitle;
      previousTitleRef.current = newTitle;
    }

    return () => {
      // Only reset if we're not navigating to another chat
      const trimmed_appName = APP_NAME.trim();
      if (!chatId && previousTitleRef.current !== trimmed_appName) {
        document.title = trimmed_appName;
        previousTitleRef.current = trimmed_appName;
      }
    };
  }, [chatTitle, chatId]);
}
