"use client";

import { SignOut, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/providers/user-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

// The content previously inside settings.tsx
export function SettingsContent({
  onCloseAction,
  isDrawer = false,
}: {
  onCloseAction: () => void;
  isDrawer?: boolean;
}) {
  const { signOut } = useUser();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
      toast({ title: "Logged out", status: "success" });
    } catch {
      toast({ title: "Failed to sign out", status: "error" });
    }
  };

  return (
    <div className={isDrawer ? "p-0 pb-16" : "py-0"}>
      {isDrawer && (
        <div className="mb-2 flex items-center justify-between border-border border-b px-4 pb-2">
          <h2 className="font-medium text-lg">Settings</h2>
          <Button onClick={onCloseAction} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Sign Out */}
      <div className="border-border border-t">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">Account</h3>
              <p className="text-muted-foreground text-xs">
                Log out on this device
              </p>
            </div>
            <Button
              className="flex items-center gap-2"
              onClick={handleSignOut}
              size="sm"
              variant="secondary"
            >
              <SignOut className="size-4" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
