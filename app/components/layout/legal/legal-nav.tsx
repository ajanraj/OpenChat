"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LEGAL_NAV_ITEMS = [
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Terms of Service", href: "/terms" },
  { name: "Security Policy", href: "/security" },
] as const;

function LegalNavComponent() {
  const pathname = usePathname();

  // Determine the active tab by finding exact pathname match
  const activeTab = LEGAL_NAV_ITEMS.find(
    (item) => pathname === item.href
  )?.href;

  return (
    <Tabs className="mb-8" value={activeTab}>
      <div className="overflow-x-auto">
        <TabsList className="h-auto w-full p-1">
          {LEGAL_NAV_ITEMS.map((item) => (
            <TabsTrigger
              asChild
              className="flex-1"
              key={item.href}
              value={item.href}
            >
              <Link href={item.href}>{item.name}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

export const LegalNav = React.memo(LegalNavComponent);
