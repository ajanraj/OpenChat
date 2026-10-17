import { useEffect, useRef } from "react";

import { APP_NAME } from "@/lib/config/constants";

export const useDocumentTitle = (chatTitle?: string, chatId?: string) => {
  const previousTitleRef = useRef<string>(null);

  useEffect(() => {
    const appName = APP_NAME.trim();
    const newTitle =
      chatTitle !== undefined && chatTitle !== ""
        ? `${chatTitle} - ${appName}`
        : appName;

    // Only update if the title actually changed
    if (previousTitleRef.current !== newTitle) {
      document.title = newTitle;
      previousTitleRef.current = newTitle;
    }

    return () => {
      // Only reset if we're not navigating to another chat
      const trimmed_appName = APP_NAME.trim();
      if (
        (chatId === undefined || chatId === "") &&
        previousTitleRef.current !== trimmed_appName
      ) {
        document.title = trimmed_appName;
        previousTitleRef.current = trimmed_appName;
      }
    };
  }, [chatTitle, chatId]);
};
