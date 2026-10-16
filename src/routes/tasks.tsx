import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { ScheduledTasksPage } from "@/components/scheduled-tasks/scheduled-tasks-page";
import { useUser } from "@/providers/user-provider";

export const Route = createFileRoute("/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while user data is still loading
    if (isLoading) {
      return;
    }

    if (!user || user.isAnonymous) {
      void router.navigate({ to: "/auth" });
    }
  }, [user, isLoading, router]);

  if (!user || user?.isAnonymous) {
    return null;
  }

  return <ScheduledTasksPage />;
}
