"use client";

import { X } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DrawerSettingsProps = {
  trigger: React.ReactNode;
  isOpen: boolean;
  setIsOpenAction: (open: boolean) => void;
};

// Dynamically import the same pages used in the desktop routes so that we
// don't duplicate code. Disable SSR to avoid hydration mismatches within the
// client-side drawer.
const AccountPage = dynamic(
  () => import("@/app/settings/page").then((m) => m.default),
  { ssr: false }
);
const CustomizationPage = dynamic(
  () => import("@/app/settings/customization/page").then((m) => m.default),
  { ssr: false }
);
const HistorySettingsPage = dynamic(
  () => import("@/app/settings/history/page").then((m) => m.default),
  { ssr: false }
);
const AttachmentsPage = dynamic(
  () => import("@/app/settings/attachments/page").then((m) => m.default),
  { ssr: false }
);
const ApiKeysPage = dynamic(
  () => import("@/app/settings/api-keys/page").then((m) => m.default),
  { ssr: false }
);
const ModelsPage = dynamic(
  () => import("@/app/settings/models/page").then((m) => m.default),
  { ssr: false }
);
const ConnectorsPage = dynamic(
  () => import("@/app/settings/connectors/page").then((m) => m.default),
  { ssr: false }
);

const NAV_ITEMS = [
  { key: "account", name: "Account" },
  { key: "customization", name: "Customization" },
  { key: "history", name: "History & Sync" },
  { key: "models", name: "Models" },
  { key: "api-keys", name: "API Keys" },
  { key: "connectors", name: "Connectors" },
  { key: "attachments", name: "Attachments" },
] as const;

export function DrawerSettings({
  trigger,
  isOpen,
  setIsOpenAction,
}: DrawerSettingsProps) {
  return (
    <Drawer
      dismissible={true}
      onOpenChange={setIsOpenAction}
      open={isOpen}
      shouldScaleBackground={false}
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <div className="flex h-dvh max-h-[80vh] flex-col">
          <DrawerHeader className="flex-row items-center justify-between border-border border-b px-6 py-4">
            <DrawerTitle className="font-semibold text-base">
              Settings
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                aria-label="Close settings"
                className="flex size-11 items-center justify-center rounded-full hover:bg-muted focus:outline-none"
                type="button"
              >
                <X className="size-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>

          <Tabs
            className="flex flex-1 flex-col overflow-hidden"
            defaultValue="account"
          >
            <div className="relative mb-2">
              <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background" />
              <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background" />
              <div className="overflow-x-auto">
                <TabsList className="h-auto w-max min-w-full p-1 [scroll-snap-type:x_mandatory]">
                  {NAV_ITEMS.map((item) => (
                    <TabsTrigger
                      className="shrink-0 [scroll-snap-align:start]"
                      key={item.key}
                      value={item.key}
                    >
                      {item.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 pt-4 pb-16">
              <TabsContent value="account">
                <AccountPage />
              </TabsContent>
              <TabsContent value="customization">
                <CustomizationPage />
              </TabsContent>
              <TabsContent value="history">
                <HistorySettingsPage />
              </TabsContent>
              <TabsContent value="models">
                <ModelsPage />
              </TabsContent>
              <TabsContent value="api-keys">
                <ApiKeysPage />
              </TabsContent>
              <TabsContent value="connectors">
                <ConnectorsPage />
              </TabsContent>
              <TabsContent value="attachments">
                <AttachmentsPage />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
