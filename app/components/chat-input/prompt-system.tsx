"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo, useState } from "react";
import { useSidebar } from "@/app/providers/sidebar-provider";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Personas } from "./personas";
import { Suggestions } from "./suggestions";

type PromptSystemProps = {
  onValueChange: (value: string) => void;
  onSuggestion: (suggestion: string) => void;
  onSelectSystemPrompt: (personaId: string) => void;
  isEmpty: boolean;
  selectedPersonaId?: string;
};

export const PromptSystem = memo(function PromptSystemComponent({
  onValueChange,
  onSuggestion,
  onSelectSystemPrompt,
  isEmpty,
  selectedPersonaId,
}: PromptSystemProps) {
  const [isPersonaMode, setIsPersonaMode] = useState(false);
  const { isSidebarOpen } = useSidebar();

  const tabs = useMemo(
    () => [
      {
        id: "personas",
        label: "Personas",
        isActive: isPersonaMode,
        onClick: () => {
          setIsPersonaMode(true);
          onSelectSystemPrompt("");
        },
      },
      {
        id: "suggestions",
        label: "Suggestions",
        isActive: !isPersonaMode,
        onClick: () => {
          setIsPersonaMode(false);
          onSelectSystemPrompt("");
        },
      },
    ],
    [isPersonaMode, onSelectSystemPrompt]
  );

  return (
    <>
      <div className="relative order-1 w-full md:absolute md:bottom-[-70px] md:order-2 md:h-[70px]">
        <AnimatePresence mode="popLayout">
          {isPersonaMode ? (
            <Personas
              onSelectSystemPrompt={onSelectSystemPrompt}
              selectedPersonaId={selectedPersonaId}
            />
          ) : (
            <Suggestions
              isEmpty={isEmpty}
              onSuggestion={onSuggestion}
              onValueChange={onValueChange}
            />
          )}
        </AnimatePresence>
      </div>
      <motion.div
        animate={{
          transform: isSidebarOpen ? "translateX(128px)" : "translateX(0px)",
        }}
        className="md:-translate-x-1/2 relative right-0 bottom-0 left-0 mx-auto mb-4 flex h-8 w-auto items-center justify-center rounded-lg p-1 md:fixed md:bottom-0 md:left-1/2"
        initial={{
          transform: isSidebarOpen ? "translateX(128px)" : "translateX(0px)",
        }}
        transition={TRANSITION_LAYOUT}
      >
        <div className="relative flex h-full flex-row gap-3">
          {tabs.map((tab) => (
            <button
              className={cn(
                "relative z-10 flex h-full flex-1 items-center justify-center rounded-md px-2 py-1 font-medium text-xs transition-colors active:scale-[0.98]",
                tab.isActive ? "text-foreground" : "text-muted-foreground"
              )}
              key={tab.id}
              onClick={tab.onClick}
              type="button"
            >
              <AnimatePresence initial={false}>
                {tab.isActive && (
                  <motion.div
                    animate={{
                      opacity: 1,
                    }}
                    className={cn("absolute inset-0 z-10 rounded-lg bg-muted")}
                    exit={{
                      opacity: 0,
                    }}
                    initial={{ opacity: 1 }}
                    layoutId={"background"}
                    style={{
                      originY: "0px",
                    }}
                    transition={{
                      duration: 0.25,
                      type: "spring",
                      bounce: 0,
                    }}
                  />
                )}
              </AnimatePresence>
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
});
