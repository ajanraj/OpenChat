"use client";

import { NotePencil } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ButtonNewChat() {
  const pathname = usePathname();
  if (pathname === "/") {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          href="/"
          prefetch
        >
          <NotePencil size={24} />
        </Link>
      </TooltipTrigger>
      <TooltipContent>New Chat</TooltipContent>
    </Tooltip>
  );
}
