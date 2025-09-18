"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { DotIcon, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import {
  Children,
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { ConnectorIcon } from "@/app/components/common/connector-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AvatarStack } from "@/components/ui/kibo-ui/avatar-stack";
import {
  getConnectorConfig,
  getConnectorTypeFromToolName,
  isConnectorTool,
} from "@/lib/config/tools";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

type ChainOfThoughtContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
  null
);

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "ChainOfThought components must be used within ChainOfThought"
    );
  }
  return context;
};

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  tools?: string[];
};

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    tools = [],
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [isOpen, setIsOpen] = useControllableState({
      prop: open,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });

    return (
      <div className={cn("my-3 w-full", className)} {...props}>
        <div className="flex min-h-[2.625rem] flex-col rounded-xl border bg-card leading-normal tracking-tight shadow-sm transition-all duration-300 ease-out">
          <ChainOfThoughtContext.Provider value={{ isOpen, setIsOpen }}>
            {children}
          </ChainOfThoughtContext.Provider>
        </div>
      </div>
    );
  }
);

export type ChainOfThoughtHeaderProps = ComponentProps<"button"> & {
  tools?: string[];
};

export const ChainOfThoughtHeader = memo(
  ({
    className,
    children,
    tools = [],
    ...props
  }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought();

    // Memoized values to prevent recalculation on every render
    const displayText = useMemo(() => {
      return children ?? "Chain of Thought";
    }, [children]);

    const statusText = useMemo(() => {
      if (tools.length > 0) {
        return `${tools.length} tool${tools.length !== 1 ? "s" : ""}`;
      }
      return "Completed";
    }, [tools.length]);

    const buttonClassName = useMemo(() => {
      return cn(
        "group/row flex h-[2.625rem] flex-row items-center justify-between gap-4 rounded-xl px-3 py-2 text-muted-foreground transition-colors duration-200 cursor-pointer hover:text-foreground"
      );
    }, []);

    const caretClassName = useMemo(() => {
      return "flex items-center justify-center text-muted-foreground";
    }, []);

    // Memoized event handlers to prevent child rerenders
    const handleToggleExpanded = useCallback(() => {
      setIsOpen(!isOpen);
    }, [isOpen, setIsOpen]);

    // Get the first 3 tools for display and their connector configs
    const displayToolsWithIcons = useMemo(() => {
      return tools.slice(0, 3).map((toolName) => {
        try {
          if (isConnectorTool(toolName)) {
            const connectorType = getConnectorTypeFromToolName(toolName);
            const connectorConfig = getConnectorConfig(connectorType);
            return {
              toolName,
              config: connectorConfig,
              isConnector: true,
            };
          }
          return {
            toolName,
            config: null,
            isConnector: false,
          };
        } catch {
          return {
            toolName,
            config: null,
            isConnector: false,
          };
        }
      });
    }, [tools]);

    const hasMoreTools = tools.length > 3;

    return (
      <button
        className={buttonClassName}
        onClick={handleToggleExpanded}
        type="button"
        {...props}
      >
        <div className="flex min-w-0 flex-row items-center gap-2">
          {/* Tool Icons - show max 3 */}
          <div className="flex h-5 w-5 items-center justify-center text-muted-foreground">
            {displayToolsWithIcons.length > 0 ? (
              <AvatarStack animate={true} size={16}>
                {displayToolsWithIcons.map((tool, index) => (
                  <Avatar className="h-4 w-4" key={`${tool.toolName}-${index}`}>
                    <AvatarFallback className="h-4 w-4 bg-transparent">
                      {tool.isConnector && tool.config ? (
                        <ConnectorIcon
                          className="h-3 w-3"
                          connector={tool.config}
                        />
                      ) : (
                        <DotIcon className="h-2 w-2" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {hasMoreTools && (
                  <Avatar className="h-4 w-4">
                    <AvatarFallback className="h-4 w-4 bg-transparent font-medium text-[8px]">
                      +{tools.length - 3}
                    </AvatarFallback>
                  </Avatar>
                )}
              </AvatarStack>
            ) : (
              <DotIcon className="size-4" />
            )}
          </div>
          <div className="flex-grow overflow-hidden overflow-ellipsis whitespace-nowrap text-left text-muted-foreground text-sm leading-tight">
            {displayText}
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 flex-row items-center gap-1.5">
          <p className="shrink-0 whitespace-nowrap pl-1 text-muted-foreground text-sm leading-tight">
            {statusText}
          </p>
          <motion.div
            animate={{
              rotate: isOpen ? -180 : 0,
            }}
            className={cn(caretClassName, "h-4 w-4")}
            initial={{
              rotate: isOpen ? -180 : 0,
            }}
            transition={TRANSITION_LAYOUT}
          >
            <CaretDown size={20} />
          </motion.div>
        </div>
      </button>
    );
  }
);

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: string;
  description?: string;
  status?: "complete" | "active" | "pending";
};

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    const statusStyles = {
      complete: "text-muted-foreground",
      active: "text-foreground",
      pending: "text-muted-foreground/50",
    };

    return (
      <div
        className={cn(
          "flex min-w-0 gap-2 text-sm",
          statusStyles[status],
          "fade-in-0 slide-in-from-top-2 animate-in",
          className
        )}
        {...props}
      >
        <div className="relative mt-0.5 shrink-0">
          <Icon className="size-4" />
          <div className="-mx-px absolute top-7 bottom-0 left-1/2 w-px bg-border" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>{label}</div>
          {description && (
            <div className="text-muted-foreground text-xs">{description}</div>
          )}
          {children && <div className="w-full min-w-0">{children}</div>}
        </div>
      </div>
    );
  }
);

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

export const ChainOfThoughtSearchResults = memo(
  ({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
    <div className={cn("flex items-center gap-2", className)} {...props} />
  )
);

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

export const ChainOfThoughtSearchResult = memo(
  ({ className, children, ...props }: ChainOfThoughtSearchResultProps) => (
    <Badge
      className={cn("gap-1 px-2 py-0.5 font-normal text-xs", className)}
      variant="secondary"
      {...props}
    >
      {children}
    </Badge>
  )
);

export type ChainOfThoughtContentProps = {
  className?: string;
  children?: React.ReactNode;
  autoScrollKey?: number | string;
};

export const ChainOfThoughtContent = memo(
  ({ className, children, autoScrollKey }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought();

    const resultsClassName = useMemo(() => {
      return "shrink-0 overflow-hidden";
    }, []);

    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const childCount = useMemo(() => Children.count(children), [children]);

    useLayoutEffect(() => {
      if (!isOpen) {
        return;
      }
      if (autoScrollKey === undefined) {
        return;
      }
      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    }, [isOpen, childCount, autoScrollKey]);

    return (
      <motion.div
        animate={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0,
        }}
        className={resultsClassName}
        initial={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0,
        }}
        tabIndex={-1}
        transition={TRANSITION_LAYOUT}
      >
        <div className="w-full min-w-0">
          <div
            className="h-full max-h-[400px] w-full min-w-0 overflow-y-auto overflow-x-hidden"
            ref={scrollContainerRef}
            style={{ scrollbarGutter: "stable" }}
            tabIndex={-1}
          >
            <div
              className={cn(
                "flex w-full min-w-0 flex-col gap-3 p-3 pt-1",
                className
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
);

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-2 space-y-2", className)} {...props}>
      <div className="relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
        {children}
      </div>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </div>
  )
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
