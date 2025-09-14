"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HeaderGoBack } from "@/app/components/header-go-back";
import { SettingsNav } from "@/app/components/layout/settings/settings-nav";
import { SettingsSidebar } from "@/app/components/layout/settings/settings-sidebar";
import { useUser } from "@/app/providers/user-provider";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while user data is still loading
    if (isLoading) {
      return;
    }

    // Redirect unauthenticated users to login page (middleware should catch this)
    if (!user) {
      router.replace("/auth");
      return;
    }

    // Redirect anonymous users to login page to upgrade their account
    if (user?.isAnonymous) {
      router.replace("/auth");
      return;
    }
  }, [user, isLoading, router]);

  if (!user || user?.isAnonymous) {
    return null;
  }

  // Always use desktop layout - mobile users will access via DrawerSettings
  return (
    <div className="flex min-h-screen flex-col items-center">
      <div className="w-full max-w-6xl">
        <HeaderGoBack href="/" />
      </div>
      <main className="flex w-full max-w-6xl flex-1 gap-4 p-4 md:flex-row md:p-8">
        <div className="hidden w-full space-y-8 md:block md:w-[28%]">
          <SettingsSidebar />
        </div>
        <div className="w-full md:w-[72%] md:pl-12">
          <SettingsNav />
          {children}
        </div>
      </main>
    </div>
  );
}
