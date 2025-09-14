"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ScheduledTasksPage } from "@/app/components/scheduled-tasks/scheduled-tasks-page";
import { useUser } from "@/app/providers/user-provider";

export default function TasksPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while user data is still loading
    if (isLoading) {
      return;
    }

    if (!user || user.isAnonymous) {
      router.replace("/auth");
    }
  }, [user, isLoading, router]);

  if (!user || user?.isAnonymous) {
    return null;
  }

  return <ScheduledTasksPage />;
}
