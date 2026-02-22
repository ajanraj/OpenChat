import { useLocation } from "@tanstack/react-router";
import {
  useCallback,
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";

interface ChatSessionContextType {
  chatId: string | null;
  isDeleting: boolean;
  setIsDeleting: Dispatch<SetStateAction<boolean>>;
}

const ChatSessionContext = createContext<ChatSessionContextType>({
  chatId: null,
  isDeleting: false,
  setIsDeleting: () => {
    // Default no-op function
  },
});

export const useChatSession = () => useContext(ChatSessionContext);

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

  const chatId = useMemo(() => {
    if (pathname?.startsWith("/c/")) {
      return pathname.split("/c/")[1];
    }
    return null;
  }, [pathname]);

  const isDeleting = chatId !== null && deletingChatId === chatId;

  const setIsDeleting = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextDeleting) => {
      setDeletingChatId((currentDeletingChatId) => {
        const currentValue = chatId !== null && currentDeletingChatId === chatId;
        const nextValue =
          typeof nextDeleting === "function" ? nextDeleting(currentValue) : nextDeleting;
        if (!nextValue || chatId === null) {
          return null;
        }
        return chatId;
      });
    },
    [chatId],
  );

  const contextValue = useMemo(
    () => ({
      chatId,
      isDeleting,
      setIsDeleting,
    }),
    [chatId, isDeleting, setIsDeleting],
  );

  return <ChatSessionContext.Provider value={contextValue}>{children}</ChatSessionContext.Provider>;
}
