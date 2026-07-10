import {
	ArchiveIcon,
	ClockIcon,
	DotsThreeVerticalIcon,
	PauseIcon,
	PencilIcon,
	PlayIcon,
	RepeatOnceIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import dayjs from "dayjs";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pill, PillIndicator } from "@/components/ui/pill";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ERROR_CODES } from "@/lib/error-codes";
import { classifyError } from "@/lib/error-utils";
import { api } from "../../../convex/_generated/api";
import { ExecutionHistoryTrigger } from "./execution-history-trigger";
import { TaskTrigger } from "./task-trigger";
import type { ScheduledTask, ScheduleType } from "./types";

type TaskDialogData = {
	taskId: ScheduledTask["_id"];
	title: string;
	prompt: string;
	scheduleType: ScheduleType;
	scheduledTime: string;
	timezone: string;
	enableSearch?: boolean;
	enabledToolSlugs?: string[];
	emailNotifications?: boolean;
	profileId?: ScheduledTask["profileId"];
};

// Static constants moved outside component for better performance
const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

const SCHEDULE_TYPE_DISPLAY_MAP = {
	onetime: "One-time",
	daily: "Daily",
	weekly: "Weekly",
} as const;

type TaskCardProps = {
	task: ScheduledTask;
	isMobile?: boolean;
};

type TaskCardActions = {
	onPauseResume: () => void;
	onTriggerNow: () => void;
	onArchive: () => void;
	onDeleteClick: () => void;
	taskDialogInitialData: TaskDialogData;
};

type TaskDisplayData = {
	scheduleDisplay: string;
	weeklyDay: string | null;
	nextExecutionDisplay: string;
	lastExecutionDisplay: string;
};

type StatusPillsProps = {
	status: ScheduledTask["status"];
};

function StatusPills({ status }: StatusPillsProps) {
	if (status === "paused") {
		return (
			<Pill className="text-xs" variant="outline">
				<PillIndicator pulse={false} variant="warning" />
				Paused
			</Pill>
		);
	}
	if (status === "running") {
		return (
			<Pill className="text-xs" variant="outline">
				<PillIndicator pulse={true} variant="success" />
				Running
			</Pill>
		);
	}
	if (status === "archived") {
		return (
			<Pill className="text-xs" variant="outline">
				<PillIndicator pulse={false} variant="info" />
				Archived
			</Pill>
		);
	}
	return null;
}

type TaskMobileLayoutProps = {
	task: ScheduledTask;
	display: TaskDisplayData;
	actions: TaskCardActions;
};

function TaskMobileLayout({ task, display, actions }: TaskMobileLayoutProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const { scheduleDisplay, weeklyDay, nextExecutionDisplay, lastExecutionDisplay } = display;
	const { onPauseResume, onTriggerNow, onArchive, onDeleteClick, taskDialogInitialData } = actions;

	return (
		<div
			aria-expanded={isExpanded}
			aria-label={`${task.title} task card${isExpanded ? ", expanded" : ", collapsed"}`}
			className="w-full cursor-pointer rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-sm"
			onClick={() => setIsExpanded(!isExpanded)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					setIsExpanded(!isExpanded);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="mb-2 flex items-center gap-2">
							<h3
								className={`font-medium text-lg leading-tight ${task.status === "active" || task.status === "running" ? "" : "opacity-60"}`}
							>
								{task.title}
							</h3>
							<StatusPills status={task.status} />
						</div>
						<p className="text-muted-foreground text-sm">
							Next Run: {nextExecutionDisplay}
						</p>
					</div>

					<div className="flex items-center gap-2">
						<Button
							aria-label={task.status === "active" ? "Pause task" : "Resume task"}
							className="h-11 w-11"
							disabled={task.status === "running" || task.status === "archived"}
							onClick={(e) => {
								e.stopPropagation();
								onPauseResume();
							}}
							size="icon"
							variant="ghost"
						>
							{task.status === "active" ? (
								<PauseIcon className="h-5 w-5" />
							) : (
								<PlayIcon className="h-5 w-5" />
							)}
						</Button>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									aria-label="More task actions"
									className="h-11 w-11"
									onClick={(e) => e.stopPropagation()}
									size="icon"
									variant="ghost"
								>
									<DotsThreeVerticalIcon className="h-5 w-5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									disabled={
										task.status === "archived" ||
										task.status === "running" ||
										task.status === "paused"
									}
									onClick={(e) => {
										e.stopPropagation();
										onTriggerNow();
									}}
								>
									<RepeatOnceIcon className="mr-2 h-4 w-4" />
									Run once now
								</DropdownMenuItem>
								<ExecutionHistoryTrigger
									taskId={task._id}
									taskTitle={task.title}
									trigger={
										<DropdownMenuItem
											onClick={(e) => e.stopPropagation()}
											onSelect={(e) => e.preventDefault()}
										>
											<ClockIcon className="mr-2 h-4 w-4" />
											View history
										</DropdownMenuItem>
									}
								/>
								<TaskTrigger
									disabled={task.status === "archived" || task.status === "running"}
									initialData={taskDialogInitialData}
									mode="edit"
									trigger={
										<DropdownMenuItem
											disabled={task.status === "archived" || task.status === "running"}
											onClick={(e) => e.stopPropagation()}
											onSelect={(e) => e.preventDefault()}
										>
											<PencilIcon className="mr-2 h-4 w-4" />
											Edit task
										</DropdownMenuItem>
									}
								/>
								<DropdownMenuItem
									disabled={task.status === "archived" || task.status === "running"}
									onClick={(e) => {
										e.stopPropagation();
										onArchive();
									}}
								>
									<ArchiveIcon className="mr-2 h-4 w-4" />
									Archive
								</DropdownMenuItem>
								<DropdownMenuItem
									className="text-destructive"
									disabled={task.status === "running"}
									onClick={(e) => {
										e.stopPropagation();
										onDeleteClick();
									}}
								>
									<TrashIcon className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				{isExpanded ? (
					<div className="mt-4 space-y-3 border-border/50 border-t pt-4">
						<div className="flex flex-wrap gap-2">
							<Pill className="text-xs" variant="outline">
								{scheduleDisplay}
							</Pill>
							{weeklyDay ? (
								<Pill className="text-xs" variant="outline">
									{weeklyDay}
								</Pill>
							) : null}
							{task.emailNotifications ? (
								<Pill className="text-xs" variant="outline">
									Email
								</Pill>
							) : null}
						</div>
						<div className="space-y-1 text-muted-foreground text-sm">
							<p>Last Run: {lastExecutionDisplay}</p>
						</div>
						{!!task.lastExecuted && !!task.chatId ? (
							<div className="pt-2">
								<Link
									className="text-primary text-sm hover:underline"
									to="/c/$chatId"
									params={{ chatId: task.chatId }}
									onClick={(e) => e.stopPropagation()}
								>
									View Results
								</Link>
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
}

type TaskDesktopLayoutProps = {
	task: ScheduledTask;
	display: TaskDisplayData;
	actions: TaskCardActions;
	tooltipContent: string;
	triggerTooltipContent: string;
};

function TaskDesktopLayout({
	task,
	display,
	actions,
	tooltipContent,
	triggerTooltipContent,
}: TaskDesktopLayoutProps) {
	const { scheduleDisplay, weeklyDay, nextExecutionDisplay, lastExecutionDisplay } = display;
	const { onPauseResume, onTriggerNow, onArchive, onDeleteClick, taskDialogInitialData } = actions;

	return (
		<div className="group rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-sm">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<div className="mb-1 flex items-center gap-2">
						<h3
							className={`font-medium text-lg ${task.status === "active" || task.status === "running" ? "" : "opacity-60"}`}
						>
							{task.title}
						</h3>
						<Pill className="text-xs" variant="outline">
							{scheduleDisplay}
						</Pill>
						{weeklyDay ? (
							<Pill className="text-xs" variant="outline">
								{weeklyDay}
							</Pill>
						) : null}
						{task.emailNotifications ? (
							<Pill className="text-xs" variant="outline">
								Email
							</Pill>
						) : null}
						<StatusPills status={task.status} />
					</div>

					<div className="mt-4 space-y-1 text-muted-foreground text-sm">
						<p>Next Run: {nextExecutionDisplay}</p>
						<p>Last Run: {lastExecutionDisplay}</p>
					</div>
				</div>

				<div className="flex h-full flex-col justify-between">
					<div className="flex items-center justify-end gap-1">
						<Tooltip>
							<TooltipTrigger
								asChild
								className={
									task.status === "running" || task.status === "archived"
										? "cursor-not-allowed"
										: ""
								}
							>
								<Button
									aria-label={task.status === "active" ? "Pause task" : "Resume task"}
									className="h-8 w-8"
									disabled={task.status === "running" || task.status === "archived"}
									onClick={onPauseResume}
									size="icon"
									variant="ghost"
								>
									{task.status === "active" ? (
										<PauseIcon className="h-4 w-4" />
									) : (
										<PlayIcon className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>{tooltipContent}</p>
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger
								asChild
								className={
									task.status === "archived" ||
									task.status === "running" ||
									task.status === "paused"
										? "cursor-not-allowed"
										: ""
								}
							>
								<Button
									aria-label="Run task once now"
									className="h-8 w-8"
									disabled={
										task.status === "archived" ||
										task.status === "running" ||
										task.status === "paused"
									}
									onClick={onTriggerNow}
									size="icon"
									variant="ghost"
								>
									<RepeatOnceIcon className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>{triggerTooltipContent}</p>
							</TooltipContent>
						</Tooltip>

						<ExecutionHistoryTrigger
							taskId={task._id}
							taskTitle={task.title}
							trigger={
								<span>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												aria-label="View execution history"
												className="h-8 w-8"
												size="icon"
												variant="ghost"
											>
												<ClockIcon className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											<p>View execution history</p>
										</TooltipContent>
									</Tooltip>
								</span>
							}
						/>

						<TaskTrigger
							disabled={task.status === "archived" || task.status === "running"}
							initialData={taskDialogInitialData}
							mode="edit"
							trigger={
								<span
									className={
										task.status === "archived" || task.status === "running"
											? "cursor-not-allowed"
											: ""
									}
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												aria-label="Edit task"
												className="h-8 w-8"
												disabled={task.status === "archived" || task.status === "running"}
												size="icon"
												variant="ghost"
											>
												<PencilIcon className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											<p>
												{task.status === "running"
													? "Cannot edit - task is running"
													: "Edit task"}
											</p>
										</TooltipContent>
									</Tooltip>
								</span>
							}
						/>

						<Tooltip>
							<TooltipTrigger
								asChild
								className={
									task.status === "archived" || task.status === "running"
										? "cursor-not-allowed"
										: ""
								}
							>
								<Button
									aria-label="Archive task"
									className="h-8 w-8"
									disabled={task.status === "archived" || task.status === "running"}
									onClick={onArchive}
									size="icon"
									variant="ghost"
								>
									<ArchiveIcon className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>
									{task.status === "running"
										? "Cannot archive - task is running"
										: "Archive task"}
								</p>
							</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label="Delete task"
									className="h-8 w-8"
									disabled={task.status === "running"}
									onClick={onDeleteClick}
									size="icon"
									variant="ghost"
								>
									<TrashIcon className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>
									{task.status === "running"
										? "Cannot delete - task is running"
										: "Delete task"}
								</p>
							</TooltipContent>
						</Tooltip>
					</div>

					<div className="mt-10 flex justify-end">
						{!!task.lastExecuted && !!task.chatId ? (
							<Link
								className="text-primary text-xs hover:underline"
								to="/c/$chatId"
								params={{ chatId: task.chatId }}
							>
								View Results
							</Link>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function TaskCardComponent({ task, isMobile = false }: TaskCardProps) {
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const deleteTask = useMutation(api.scheduled_tasks.deleteScheduledTask);
	const updateTask = useMutation(api.scheduled_tasks.updateScheduledTask);
	const triggerTask = useMutation(api.scheduled_tasks.triggerScheduledTask);

	const handleDelete = async () => {
		try {
			await deleteTask({ taskId: task._id });
			toast.success("Background Agent deleted successfully");
		} catch (_error) {
			toast.error("Failed to delete task");
		}
		setShowDeleteDialog(false);
	};

	const handlePauseResume = async () => {
		const newStatus = task.status === "active" ? "paused" : "active";
		const successMessage =
			task.status === "active" ? "Background Agent paused" : "Background Agent resumed";
		const errorMessage = `Failed to ${task.status === "active" ? "pause" : "resume"} task`;
		try {
			await updateTask({ taskId: task._id, status: newStatus });
			toast.success(successMessage);
		} catch (error) {
			const classifiedError = classifyError(error);
			toast.error(
				classifiedError.code === ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED
					? classifiedError.userFriendlyMessage
					: errorMessage,
			);
		}
	};

	const handleTriggerNow = async () => {
		try {
			await triggerTask({ taskId: task._id });
			toast.success("Background Agent triggered successfully");
		} catch (error) {
			const classifiedError = classifyError(error);
			toast.error(
				classifiedError.code === ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED
					? classifiedError.userFriendlyMessage
					: "Failed to trigger task",
			);
		}
	};

	const handleArchive = useCallback(async () => {
		try {
			await updateTask({ taskId: task._id, status: "archived" });
			toast.success("Background Agent archived successfully");
		} catch (_error) {
			toast.error("Failed to archive task");
		}
	}, [updateTask, task._id]);

	const formatTime = useCallback((timestamp: number | undefined) => {
		if (!timestamp) return "Never";
		return dayjs(timestamp).format("MMM D, h:mm a");
	}, []);

	const display: TaskDisplayData = useMemo(() => {
		const scheduleDisplay =
			SCHEDULE_TYPE_DISPLAY_MAP[task.scheduleType as keyof typeof SCHEDULE_TYPE_DISPLAY_MAP] ||
			task.scheduleType;

		let weeklyDay: string | null = null;
		if (task.scheduleType === "weekly") {
			const parts = task.scheduledTime.split(":");
			if (parts.length >= 3) {
				const dayNumber = Number.parseInt(parts[0], 10);
				weeklyDay = DAY_NAMES[dayNumber] ?? null;
			}
		}

		let nextExecutionDisplay: string;
		switch (task.status) {
			case "active":
				nextExecutionDisplay = formatTime(task.nextExecution);
				break;
			case "running":
				nextExecutionDisplay = "Currently running";
				break;
			case "paused":
				nextExecutionDisplay = "Paused";
				break;
			case "archived":
				nextExecutionDisplay = "Archived";
				break;
			default:
				nextExecutionDisplay = "Unknown";
		}

		return {
			scheduleDisplay,
			weeklyDay,
			nextExecutionDisplay,
			lastExecutionDisplay: formatTime(task.lastExecuted),
		};
	}, [task, formatTime]);

	const tooltipContent = useMemo(() => {
		switch (task.status) {
			case "active":
				return "Pause task";
			case "paused":
				return "Resume task";
			case "running":
				return "Background Agent is running";
			case "archived":
				return "Background Agent is archived";
			default:
				return "Unknown status";
		}
	}, [task.status]);

	const triggerTooltipContent = useMemo(() => {
		switch (task.status) {
			case "running":
				return "Cannot trigger - task is running";
			case "paused":
				return "Cannot trigger - task is paused";
			default:
				return "Run task once now";
		}
	}, [task.status]);

	const taskDialogInitialData = useMemo(
		(): TaskDialogData => ({
			taskId: task._id,
			title: task.title,
			prompt: task.prompt,
			scheduleType: task.scheduleType as ScheduleType,
			scheduledTime: task.scheduledTime,
			timezone: task.timezone,
			enableSearch: task.enableSearch,
			enabledToolSlugs: task.enabledToolSlugs,
			emailNotifications: task.emailNotifications,
			profileId: task.profileId,
		}),
		[
			task._id,
			task.title,
			task.prompt,
			task.scheduleType,
			task.scheduledTime,
			task.timezone,
			task.enableSearch,
			task.enabledToolSlugs,
			task.emailNotifications,
			task.profileId,
		],
	);

	const cardActions: TaskCardActions = {
		onPauseResume: handlePauseResume,
		onTriggerNow: handleTriggerNow,
		onArchive: handleArchive,
		onDeleteClick: () => setShowDeleteDialog(true),
		taskDialogInitialData,
	};

	return (
		<>
			{isMobile ? (
				<TaskMobileLayout task={task} display={display} actions={cardActions} />
			) : (
				<TaskDesktopLayout
					task={task}
					display={display}
					actions={cardActions}
					tooltipContent={tooltipContent}
					triggerTooltipContent={triggerTooltipContent}
				/>
			)}

			<Dialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete scheduled task?</DialogTitle>
						<DialogDescription>
							This action cannot be undone. This will permanently delete the scheduled task &quot;
							{task.title}&quot;.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setShowDeleteDialog(false)} variant="outline">
							Cancel
						</Button>
						<Button onClick={handleDelete} variant="destructive">
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

// Memoize TaskCard component to prevent unnecessary re-renders
export const TaskCard = memo(TaskCardComponent, (prevProps, nextProps) => {
	const prevTask = prevProps.task;
	const nextTask = nextProps.task;
	return (
		prevProps.isMobile === nextProps.isMobile &&
		prevTask._id === nextTask._id &&
		prevTask.title === nextTask.title &&
		prevTask.status === nextTask.status &&
		prevTask.scheduleType === nextTask.scheduleType &&
		prevTask.scheduledTime === nextTask.scheduledTime &&
		prevTask.nextExecution === nextTask.nextExecution &&
		prevTask.lastExecuted === nextTask.lastExecuted &&
		prevTask.emailNotifications === nextTask.emailNotifications &&
		prevTask.chatId === nextTask.chatId &&
		prevTask.prompt === nextTask.prompt &&
		prevTask.timezone === nextTask.timezone &&
		prevTask.enableSearch === nextTask.enableSearch &&
		prevTask.profileId === nextTask.profileId &&
		JSON.stringify(prevTask.enabledToolSlugs) === JSON.stringify(nextTask.enabledToolSlugs)
	);
});
