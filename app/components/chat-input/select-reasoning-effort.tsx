"use client";

import { BrainIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useBreakpoint } from "@/app/hooks/use-breakpoint";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PopoverContentAuth } from "./popover-content-auth";

type ReasoningEffort = "low" | "medium" | "high";

type SelectReasoningEffortProps = {
  reasoningEffort: ReasoningEffort;
  onSelectReasoningEffortAction: (reasoningEffort: ReasoningEffort) => void;
  isUserAuthenticated: boolean;
};

export function SelectReasoningEffort({
  reasoningEffort,
  onSelectReasoningEffortAction,
  isUserAuthenticated,
}: SelectReasoningEffortProps) {
  const isMobile = useBreakpoint(768);
  const capitalizedReasoningEffort =
    reasoningEffort.charAt(0).toUpperCase() + reasoningEffort.slice(1);

  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              {isMobile ? (
                <Button
                  aria-label="Select reasoning effort"
                  className="size-9 rounded-full bg-transparent"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <BrainIcon className="size-4" />
                </Button>
              ) : (
                <Button
                  className="h-9 w-auto rounded-full border border-border bg-transparent text-accent-foreground"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <BrainIcon className="size-4" />
                  {capitalizedReasoningEffort}
                  <CaretDownIcon className="size-4" />
                </Button>
              )}
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Select Reasoning Effort</p>
          </TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            {isMobile ? (
              <Button
                aria-label="Select reasoning effort"
                className="size-9 rounded-full"
                size="sm"
                variant="outline"
              >
                <BrainIcon className="size-4" />
              </Button>
            ) : (
              <Button
                className="w-auto justify-between gap-2 rounded-full px-3"
                variant="outline"
              >
                <div className="flex items-center gap-2">
                  <BrainIcon className="size-4" />
                  <span>{capitalizedReasoningEffort}</span>
                </div>
                <CaretDownIcon className="size-4 opacity-50" />
              </Button>
            )}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Select Reasoning Effort</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onClick={() => onSelectReasoningEffortAction("low")}>
          Low
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelectReasoningEffortAction("medium")}
        >
          Medium
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelectReasoningEffortAction("high")}>
          High
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
