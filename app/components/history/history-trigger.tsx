"use client";

import { ListMagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CommandHistory } from "@/app/components/history/command-history";
import { DrawerHistory } from "@/app/components/history/drawer-history";
import { useBreakpoint } from "@/app/hooks/use-breakpoint";

export function HistoryTrigger() {
  const isMobileOrTablet = useBreakpoint(896);
  const [isOpen, setIsOpen] = useState(false);

  const trigger = (
    <button
      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => setIsOpen(true)}
      type="button"
    >
      <ListMagnifyingGlassIcon size={24} />
    </button>
  );

  if (isMobileOrTablet) {
    return (
      <DrawerHistory isOpen={isOpen} setIsOpen={setIsOpen} trigger={trigger} />
    );
  }

  // On desktop, render CommandHistory but hide its trigger button
  return (
    <div className="[&_button]:hidden">
      <CommandHistory />
    </div>
  );
}
