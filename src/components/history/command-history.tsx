import { convexQuery } from "@convex-dev/react-query";
import { ListMagnifyingGlass } from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	getOrderedGroupKeys,
	groupChatsByTime,
	hasChatsInGroup,
} from "@/lib/chat-utils/time-grouping";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { CommandHistoryItem } from "./command-history-item";

// Static - compute once at module level
const ORDERED_GROUP_KEYS = getOrderedGroupKeys();

function getSnippet(text: string, query: string, length = 80): React.ReactNode {
	const lower = text.toLowerCase();
	const q = query.toLowerCase();
	const idx = lower.indexOf(q);
	if (idx === -1) {
		return text.slice(0, length);
	}
	const start = Math.max(0, idx - Math.floor((length - q.length) / 2));
	const snippet = text.slice(start, start + length);
	const matchStart = idx - start;
	return (
		<>
			{snippet.slice(0, matchStart)}
			<mark>{snippet.slice(matchStart, matchStart + q.length)}</mark>
			{snippet.slice(matchStart + q.length)}
		</>
	);
}

export function CommandHistory() {
	const router = useRouter();
	const params = useParams({ strict: false }) as { chatId?: string };
	const { data: chatHistory } = useTanStackQuery({
		...convexQuery(api.chats.listChatsForUser, {}),
	});
	const deleteChat = useMutation(api.chats.deleteChat);
	const updateChatTitle = useMutation(api.chats.updateChatTitle);
	const pinChatToggle = useMutation(api.chats.pinChatToggle);
	type State = {
		isOpen: boolean;
		searchQuery: string;
		editingId: Id<"chats"> | null;
		editTitle: string;
		deletingId: Id<"chats"> | null;
	};
	type Action =
		| { type: "OPEN" }
		| { type: "TOGGLE" }
		| { type: "CLOSE" }
		| { type: "SET_SEARCH"; query: string }
		| { type: "START_EDIT"; chat: Doc<"chats"> }
		| { type: "SET_EDIT_TITLE"; title: string }
		| { type: "CANCEL_EDIT" }
		| { type: "START_DELETE"; id: Id<"chats"> }
		| { type: "CANCEL_DELETE" };

	const [state, dispatch] = useReducer(
		(s: State, action: Action): State => {
			switch (action.type) {
				case "OPEN":
					return { ...s, isOpen: true };
				case "TOGGLE":
					return { ...s, isOpen: !s.isOpen };
				case "CLOSE":
					return { ...s, isOpen: false, searchQuery: "", editingId: null, editTitle: "", deletingId: null };
				case "SET_SEARCH":
					return { ...s, searchQuery: action.query };
				case "START_EDIT":
					return { ...s, editingId: action.chat._id, editTitle: action.chat.title || "" };
				case "SET_EDIT_TITLE":
					return { ...s, editTitle: action.title };
				case "CANCEL_EDIT":
					return { ...s, editingId: null, editTitle: "" };
				case "START_DELETE":
					return { ...s, deletingId: action.id };
				case "CANCEL_DELETE":
					return { ...s, deletingId: null };
			}
		},
		{ isOpen: false, searchQuery: "", editingId: null, editTitle: "", deletingId: null },
	);
	const { isOpen, searchQuery, editingId, editTitle, deletingId } = state;

	const { data: messageResults = [] } = useTanStackQuery({
		...convexQuery(
			api.messages.searchMessages,
			searchQuery ? { query: searchQuery } : "skip",
		),
		enabled: Boolean(searchQuery),
	});

	const handleEdit = useCallback((chat: Doc<"chats">) => {
		dispatch({ type: "START_EDIT", chat });
	}, []);

	const handleSaveEdit = useCallback(
		async (id: Id<"chats">) => {
			dispatch({ type: "CANCEL_EDIT" });
			await updateChatTitle({ chatId: id, title: editTitle });
		},
		[editTitle, updateChatTitle],
	);

	const handleCancelEdit = useCallback(() => {
		dispatch({ type: "CANCEL_EDIT" });
	}, []);

	const handleDelete = useCallback((id: Id<"chats">) => {
		dispatch({ type: "START_DELETE", id });
	}, []);

	const handleConfirmDelete = useCallback(
		async (id: Id<"chats">) => {
			dispatch({ type: "CANCEL_DELETE" });
			await deleteChat({ chatId: id });
		},
		[deleteChat],
	);

	const handleCancelDelete = useCallback(() => {
		dispatch({ type: "CANCEL_DELETE" });
	}, []);

	const handleTogglePin = useCallback(
		async (chat: Doc<"chats">) => {
			await pinChatToggle({ chatId: chat._id });
		},
		[pinChatToggle],
	);

	// Listen for global openCommandHistory and toggleFloatingSearch events
	useEffect(() => {
		const open = () => dispatch({ type: "OPEN" });
		const toggle = () => dispatch({ type: "TOGGLE" });
		window.addEventListener("openCommandHistory", open);
		window.addEventListener("toggleFloatingSearch", toggle);
		return () => {
			window.removeEventListener("openCommandHistory", open);
			window.removeEventListener("toggleFloatingSearch", toggle);
		};
	}, []);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			dispatch({ type: "CLOSE" });
		} else {
			dispatch({ type: "OPEN" });
		}
	};

	// Memoize all filtering and grouping to avoid O(N) work on every render
	const { filteredChat, pinnedChats, groupedChats } = useMemo(() => {
		if (!chatHistory) {
			return {
				filteredChat: [],
				pinnedChats: [],
				unpinnedChats: [],
				groupedChats: {} as ReturnType<typeof groupChatsByTime>,
			};
		}

		const lowerQuery = searchQuery.toLowerCase();
		const filtered = chatHistory.filter((chat) =>
			(chat.title || "").toLowerCase().includes(lowerQuery),
		);

		const pinned: Doc<"chats">[] = [];
		const unpinned: Doc<"chats">[] = [];

		for (const chat of filtered) {
			if (chat.isPinned) {
				pinned.push(chat);
			} else {
				unpinned.push(chat);
			}
		}

		return {
			filteredChat: filtered,
			pinnedChats: pinned,
			unpinnedChats: unpinned,
			groupedChats: groupChatsByTime(unpinned),
		};
	}, [chatHistory, searchQuery]);

	// Build a map for O(1) chat title lookups instead of O(N) .find() calls
	const chatTitleById = useMemo(() => {
		const map = new Map<string, string>();
		if (chatHistory) {
			for (const c of chatHistory) {
				map.set(c._id, c.title || "Untitled Chat");
			}
		}
		return map;
	}, [chatHistory]);

	// Defer route preloading to idle time and limit to top 10 items
	useEffect(() => {
		if (!(isOpen && chatHistory)) {
			return;
		}

		const subset = chatHistory.slice(0, 10);
		const preload = () => {
			for (const chat of subset) {
				router.preloadRoute({ to: "/c/$chatId", params: { chatId: chat._id } });
			}
		};

		if ("requestIdleCallback" in window) {
			const id = window.requestIdleCallback(preload);
			return () => window.cancelIdleCallback(id);
		}
		const id = setTimeout(preload, 100);
		return () => clearTimeout(id);
	}, [isOpen, chatHistory, router]);

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={() => dispatch({ type: "OPEN" })}
						type="button"
					>
						<ListMagnifyingGlass size={24} />
					</button>
				</TooltipTrigger>
				<TooltipContent>History</TooltipContent>
			</Tooltip>

			<CommandDialog
				description="Search through your past conversations"
				onOpenChange={handleOpenChange}
				open={isOpen}
				title="Chat History"
			>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={(value) => dispatch({ type: "SET_SEARCH", query: value })}
						placeholder="Search history..."
						value={searchQuery}
					/>
					<CommandList className="max-h-[480px] min-h-[480px] flex-1">
						{/* Invisible placeholder (size zero, no pointer) so nothing visible is preselected */}
						<CommandItem
							className="pointer-events-none h-0 w-0 overflow-hidden opacity-0"
							value="__placeholder"
						/>
						{filteredChat.length === 0 && messageResults.length === 0 && (
							<CommandEmpty>No chat history found.</CommandEmpty>
						)}

						{!!searchQuery && messageResults.length > 0 ? (
							<div className="px-2 pb-2">
								<div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
									Messages
								</div>
								{messageResults.map((msg) => (
									<CommandItem
										className="px-2 py-1"
										key={msg._id}
										onSelect={() => {
											// For messages, always navigate since the message ID parameter makes it a different URL
											// and we want to scroll to the specific message
											router.navigate({
												to: "/c/$chatId",
												params: { chatId: msg.chatId },
												search: { m: msg._id },
												replace: true,
											});
											dispatch({ type: "CLOSE" });
										}}
										value={msg._id}
									>
										<div className="flex flex-col">
											<span className="line-clamp-2 text-sm">
												{getSnippet(msg.content, searchQuery)}
											</span>
											<span className="text-muted-foreground text-xs">
												{chatTitleById.get(msg.chatId) ?? "Untitled Chat"}
											</span>
										</div>
									</CommandItem>
								))}
							</div>
						) : null}

						{filteredChat.length > 0 && (
							<div className="px-2 pt-1">
								<div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
									Chats
								</div>
								{pinnedChats.length > 0 && (
									<div className="px-2 pb-2">
										<div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
											Pinned
										</div>
										{pinnedChats.map((chat) => (
											<CommandHistoryItem
												chat={chat}
												chatTitleById={chatTitleById}
												currentChatId={params.chatId}
												deletingId={deletingId}
												editingId={editingId}
												editTitle={editTitle}
												handleCancelDelete={handleCancelDelete}
												handleCancelEdit={handleCancelEdit}
												handleConfirmDelete={handleConfirmDelete}
												handleDelete={handleDelete}
												handleEdit={handleEdit}
												handleSaveEdit={handleSaveEdit}
												handleTogglePin={handleTogglePin}
												key={chat._id}
												router={router}
												setEditTitle={(title) => dispatch({ type: "SET_EDIT_TITLE", title })}
												setIsOpen={(open) => dispatch({ type: open ? "OPEN" : "CLOSE" })}
											/>
										))}
									</div>
								)}
								</div>
								)}
								{/* Time-based Groups */}
								{ORDERED_GROUP_KEYS.map(
								(groupKey) =>
								hasChatsInGroup(groupedChats, groupKey) && (
									<div className="px-2 pb-2" key={groupKey}>
										<div className="flex h-8 shrink-0 items-center rounded-md px-1.5 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
											{groupKey}
										</div>
										{groupedChats[groupKey].map((chat) => (
											<CommandHistoryItem
												chat={chat}
												chatTitleById={chatTitleById}
												currentChatId={params.chatId}
												deletingId={deletingId}
												editingId={editingId}
												editTitle={editTitle}
												handleCancelDelete={handleCancelDelete}
												handleCancelEdit={handleCancelEdit}
												handleConfirmDelete={handleConfirmDelete}
												handleDelete={handleDelete}
												handleEdit={handleEdit}
												handleSaveEdit={handleSaveEdit}
												handleTogglePin={handleTogglePin}
												key={chat._id}
												router={router}
												setEditTitle={(title) => dispatch({ type: "SET_EDIT_TITLE", title })}
												setIsOpen={(open) => dispatch({ type: open ? "OPEN" : "CLOSE" })}
											/>
										))}
									</div>
								),
								)}
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}
