import {
	Check,
	GitBranch,
	PencilSimple,
	PushPinSimple,
	PushPinSimpleSlash,
	TrashSimple,
	X,
} from "@phosphor-icons/react";
import type { Router } from "@tanstack/react-router";
import React from "react";
import { Button } from "@/components/ui/button";
import { CommandItem } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type CommandHistoryItemProps = {
	chat: Doc<"chats">;
	chatTitleById: Map<string, string>;
	currentChatId?: string;
	router: Router<any, any, any>;
	editingId: Id<"chats"> | null;
	editTitle: string;
	deletingId: Id<"chats"> | null;
	handleEdit: (chat: Doc<"chats">) => void;
	handleSaveEdit: (id: Id<"chats">) => void;
	handleCancelEdit: () => void;
	handleDelete: (id: Id<"chats">) => void;
	handleConfirmDelete: (id: Id<"chats">) => void;
	handleCancelDelete: () => void;
	handleTogglePin: (chat: Doc<"chats">) => void;
	setIsOpen: (isOpen: boolean) => void;
	setEditTitle: (title: string) => void;
};

export const CommandHistoryItem = React.memo(
	function CommandHistoryItemComponent({
		chat,
		chatTitleById,
		currentChatId,
		router,
		editingId,
		editTitle,
		deletingId,
		handleEdit,
		handleSaveEdit,
		handleCancelEdit,
		handleDelete,
		handleConfirmDelete,
		handleCancelDelete,
		handleTogglePin,
		setIsOpen,
		setEditTitle,
	}: CommandHistoryItemProps) {
		// Derived state for readability and to reduce complexity
		const isEditing = editingId === chat._id;
		const isDeleting = deletingId === chat._id;
		const focusDeleteShortcutInput = React.useCallback(
			(node: HTMLInputElement | null) => {
				node?.focus();
			},
			[],
		);

		return (
			<div className="px-0 py-0.5" key={chat._id}>
				{/* Render different UI states without nested ternaries */}
				{isEditing ? (
					<div className="flex items-center justify-between rounded-lg bg-accent px-2 py-2">
						<div className="flex w-full items-center justify-between">
							<Input
								className="h-8 flex-1 rounded border border-input bg-transparent px-3 py-1"
								onChange={(e) => setEditTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleSaveEdit(chat._id);
									}
								}}
								value={editTitle}
							/>
							<div className="ml-2 flex gap-1">
								<Button
									className="size-8 text-muted-foreground hover:text-foreground"
									onClick={() => handleSaveEdit(chat._id)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<Check className="size-4" />
								</Button>
								<Button
									className="size-8 text-muted-foreground hover:text-foreground"
									onClick={handleCancelEdit}
									size="icon"
									type="button"
									variant="ghost"
								>
									<X className="size-4" />
								</Button>
							</div>
						</div>
					</div>
				) : null}
				{isDeleting ? (
					<div className="flex items-center justify-between rounded-lg bg-accent px-2 py-2">
						<div className="flex w-full items-center justify-between">
							<div className="flex flex-1 items-center">
								<span className="line-clamp-1 font-normal text-base">
									{chat.title}
								</span>
								<input
									className="sr-only"
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											e.preventDefault();
											handleCancelDelete();
										} else if (e.key === "Enter") {
											e.preventDefault();
											handleConfirmDelete(chat._id);
										}
									}}
									ref={focusDeleteShortcutInput}
									type="text"
								/>
							</div>
							<div className="ml-2 flex gap-1">
								<Button
									className="size-8 text-muted-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
									onClick={() => handleConfirmDelete(chat._id)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<Check className="size-4" />
								</Button>
								<Button
									className="size-8 text-muted-foreground hover:text-foreground"
									onClick={handleCancelDelete}
									size="icon"
									type="button"
									variant="ghost"
								>
									<X className="size-4" />
								</Button>
							</div>
						</div>
					</div>
				) : null}
				{!(isEditing || isDeleting) && (
					<CommandItem
						className={cn(
							"group flex h-9 w-full items-center justify-between rounded-md px-2 py-1 hover:bg-accent",
							Boolean(editingId || deletingId) &&
								"hover:bg-transparent data-[selected=true]:bg-transparent",
						)}
						key={chat._id}
						onSelect={() => {
							if (!(editingId || deletingId)) {
								// Only navigate if we're not already on this chat
								if (currentChatId !== chat._id) {
									router.navigate({
									to: "/c/$chatId",
									params: { chatId: chat._id },
									replace: true,
								});
								}
								setIsOpen(false);
							}
						}}
						value={chat._id}
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1">
								{chat.originalChatId ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												className="mr-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													// Only navigate if we're not already on this chat
													if (currentChatId !== chat.originalChatId && chat.originalChatId) {
														router.navigate({
															to: "/c/$chatId",
															params: { chatId: chat.originalChatId },
														});
													}
													setIsOpen(false);
												}}
												type="button"
											>
												<GitBranch className="size-3 rotate-180" />
											</button>
										</TooltipTrigger>
										<TooltipContent className="z-[9999]" side="top">
											Branched From:{" "}
											{chatTitleById.get(chat.originalChatId) ?? "Parent Chat"}
										</TooltipContent>
									</Tooltip>
								) : null}
								<span className="line-clamp-1 flex-1 font-normal text-sm">
									{chat?.title || "Untitled Chat"}
								</span>
							</div>
						</div>
						<div className="relative flex min-w-[100px] flex-shrink-0 justify-end">
							<div
								className={cn(
									"flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-0 group-hover:opacity-100",
									Boolean(editingId || deletingId) && "group-hover:opacity-0",
								)}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											className="size-7 rounded-md p-1.5 text-muted-foreground hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-400"
											onClick={(e) => {
												e.stopPropagation();
												handleTogglePin(chat);
											}}
											size="icon"
											type="button"
											variant="ghost"
										>
											{chat.isPinned ? (
												<PushPinSimpleSlash className="size-3.5" />
											) : (
												<PushPinSimple className="size-3.5" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent className="z-[9999]" side="bottom">
										{chat.isPinned ? "Unpin" : "Pin Chat"}
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											className="size-7 rounded-md p-1.5 text-muted-foreground hover:bg-blue-500/20 hover:text-blue-600 dark:hover:text-blue-400"
											onClick={(e) => {
												e.stopPropagation();
												if (chat) {
													handleEdit(chat);
												}
											}}
											size="icon"
											type="button"
											variant="ghost"
										>
											<PencilSimple className="size-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent className="z-[9999]" side="bottom">
										Edit
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											className="size-7 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/50 hover:text-destructive-foreground"
											onClick={(e) => {
												e.stopPropagation();
												if (chat?._id) {
													handleDelete(chat._id);
												}
											}}
											size="icon"
											type="button"
											variant="ghost"
										>
											<TrashSimple className="size-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent className="z-[9999]" side="bottom">
										Delete
									</TooltipContent>
								</Tooltip>
							</div>
						</div>
					</CommandItem>
				)}
			</div>
		);
	},
);
