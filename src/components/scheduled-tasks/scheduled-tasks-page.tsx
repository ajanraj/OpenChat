import { convexQuery } from "@convex-dev/react-query";
import { Plus } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { api } from "../../../convex/_generated/api";
import { TaskCard } from "./task-card";
import { TaskTrigger } from "./task-trigger";
import type { TaskStatus } from "./types";

// Static constants moved outside component for better performance
const SCROLL_CONTAINER_STYLES = {
	maxHeight: "444px",
	overflowY: "scroll" as const,
	scrollbarGutter: "stable" as const,
};


export function ScheduledTasksPage() {
	const [activeTab, setActiveTab] = useState<TaskStatus>("active");
	const isMobile = useBreakpoint(896); // Consistent breakpoint with TaskTrigger

	const taskListClassName = isMobile ? "space-y-3 pb-2" : "space-y-3 pr-4";

	const scrollStyle = isMobile ? undefined : SCROLL_CONTAINER_STYLES;

	// Memoized query configuration to prevent recreation on every render
	const queryConfig = useMemo(
		() => ({
			...convexQuery(api.scheduled_tasks.listScheduledTasks, {}),
			gcTime: 10 * 60 * 1000, // 10 minutes
		}),
		[],
	);

	const { data: tasks = [], isLoading } = useTanStackQuery(queryConfig);

	// Memoized task filtering to prevent recalculation on every render
	const filteredTasks = useMemo(
		() =>
			tasks.filter((task) => {
				if (activeTab === "active") {
					return (
						task.status === "active" ||
						task.status === "paused" ||
						task.status === "running"
					);
				}
				return task.status === "archived";
			}),
		[tasks, activeTab],
	);

	// Memoized tab change handler to prevent recreation on every render
	const handleTabChange = useCallback((value: string) => {
		setActiveTab(value as TaskStatus);
	}, []);

	return (
		<div className="flex min-h-full flex-col items-center justify-center overflow-auto pt-app-header">
			<div className="w-full max-w-3xl p-4">
				{/* Mobile-responsive header */}
				{isMobile ? (
					<div className="mb-8 space-y-4">
						{/* Mobile: Title centered at top */}
						<div className="text-center">
							<p className="mb-1 font-mono text-base text-muted-foreground">
								Background
							</p>
							<h1 className="font-semibold text-4xl">Agents</h1>
						</div>

						{/* Mobile: Full-width tabs */}
						<Tabs
							defaultValue="active"
							onValueChange={handleTabChange}
							value={activeTab}
						>
							<TabsList className="grid w-full grid-cols-2">
								<TabsTrigger value="active">Active</TabsTrigger>
								<TabsTrigger value="archived">Archived</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>
				) : (
					/* Desktop: Three-column layout */
					<div className="mb-12 grid grid-cols-3 items-end pr-4">
						{/* Tabs on the left */}
						<div className="justify-self-start">
							<Tabs
								defaultValue="active"
								onValueChange={handleTabChange}
								value={activeTab}
							>
								<TabsList className="grid w-[180px] grid-cols-2">
									<TabsTrigger value="active">Active</TabsTrigger>
									<TabsTrigger value="archived">Archived</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>

						{/* Centered Title with Background above */}
						<div className="justify-self-center text-center">
							<p className="mb-1 font-mono text-base text-muted-foreground">
								Background
							</p>
							<h1 className="font-semibold text-4xl">Agents</h1>
						</div>

						{/* Add button on the right */}
						<div className="justify-self-end">
							<TaskTrigger
								trigger={
									<Button type="button">
										<Plus className="mr-2 h-4 w-4" />
										Add new
									</Button>
								}
							/>
						</div>
					</div>
				)}

				{/* Content */}
				{isLoading ? (
					<div className="space-y-3">
						<div className="h-28 animate-pulse rounded-xl bg-muted/50" />
					</div>
				) : null}

				{!isLoading && filteredTasks.length === 0 && (
					<div
						className={`flex min-h-[138px] items-center justify-center rounded-xl border border-border bg-card/50 ${isMobile ? "" : "mr-4"}`}
					>
						<div className="text-center">
							<p className="mb-4 text-muted-foreground">
								{activeTab === "active"
									? "No scheduled tasks yet"
									: "No archived tasks"}
							</p>
							{activeTab === "active" && !isMobile && (
								<TaskTrigger
									trigger={
										<Button size="sm" type="button" variant="outline">
											Create your first background agent
										</Button>
									}
								/>
							)}
						</div>
					</div>
				)}

				{!isLoading && filteredTasks.length > 0 ? (
					<div className={taskListClassName} style={scrollStyle}>
						{filteredTasks.map((task) => (
							<TaskCard isMobile={isMobile} key={task._id} task={task} />
						))}
					</div>
				) : null}
			</div>

			{/* Mobile FAB for Add New Task */}
			{isMobile ? (
				<div className="fixed right-6 bottom-6 z-50">
					<TaskTrigger
						trigger={
							<Button
								aria-label="Add new background agent"
								className="h-14 w-14 rounded-full shadow-lg"
								size="icon"
								type="button"
							>
								<Plus className="h-6 w-6" />
							</Button>
						}
					/>
				</div>
			) : null}
		</div>
	);
}
