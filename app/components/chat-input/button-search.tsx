import { Globe } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  // PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MODELS_OPTIONS } from "@/lib/config";
import { useBreakpoint } from "../../hooks/use-breakpoint";
import { PopoverContentAuth } from "./popover-content-auth";

export type ButtonSearchProps = {
  onSearch?: () => void;
  isUserAuthenticated: boolean;
  searchEnabled?: boolean;
  model: string;
};

export function ButtonSearch({
  onSearch,
  isUserAuthenticated,
  searchEnabled = false,
  model,
}: ButtonSearchProps) {
  // Use 640px as the mobile breakpoint (Tailwind 'sm')
  const isMobile = useBreakpoint(768);
  const isToolCallingAvailable = MODELS_OPTIONS.find(
    (m) => m.id === model
  )?.features?.find((f) => f.id === "tool-calling")?.enabled;

  // Compute classes for the enabled button state without nested ternaries
  let enabledButtonClass = "";
  if (isMobile) {
    enabledButtonClass = searchEnabled
      ? "h-9 w-auto rounded-full bg-blue-500/50 text-accent-foreground transition hover:bg-blue-600/50"
      : "h-9 w-auto rounded-full px-3";
  } else {
    enabledButtonClass = searchEnabled
      ? "size-9 rounded-full bg-blue-500/50 transition hover:bg-blue-600/50"
      : "size-9 rounded-full";
  }

  if (!isToolCallingAvailable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              aria-label="Search the internet"
              className={
                isMobile
                  ? "h-9 w-auto cursor-not-allowed rounded-full px-3 opacity-50"
                  : "size-9 cursor-not-allowed rounded-full opacity-50"
              }
              disabled
              size="sm"
              type="button"
              variant="outline"
            >
              <Globe className="size-5" />
              {/* {isMobile && <span className="text-sm">Search</span>} */}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>This model does not support web search.</TooltipContent>
      </Tooltip>
    );
  }
  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label="Search the internet"
                className={
                  isMobile
                    ? "h-9 w-auto rounded-full px-3"
                    : "size-9 rounded-full"
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Globe className="size-5" />
                {/* {isMobile && <span className="text-sm">Search</span>} */}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Search the internet</TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Search the internet"
          className={enabledButtonClass}
          onClick={onSearch}
          size="sm"
          type="button"
          variant={searchEnabled ? "ghost" : "outline"}
        >
          <Globe
            className={searchEnabled ? "size-5 text-blue-400" : "size-5"}
          />
          {/* {isMobile && <span className="text-sm">Search</span>} */}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Search the internet</TooltipContent>
    </Tooltip>
  );
}
