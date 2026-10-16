import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { ScheduledTasksPage } from "@/components/scheduled-tasks/scheduled-tasks-page";
import { useUser } from "@/providers/user-provider";

const TasksPage = () => {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while user data is still loading
    if (isLoading) {
      return;
    }

    if (!user || user.isAnonymous === true) {
      void router.navigate({ to: "/auth" });
    }
  }, [user, isLoading, router]);

  if (!user || user.isAnonymous === true) {
    return null;
  }

  return <ScheduledTasksPage />;
};

export const Route = createFileRoute("/tasks")({
  component: TasksPage,
});
