import { convexQuery } from "@convex-dev/react-query";
import {
	Check,
	Copy,
	Export as ExportIcon,
	FacebookLogo,
	LinkedinLogo,
	RedditLogo,
	SpinnerGap,
	XLogo as XLogoIcon,
} from "@phosphor-icons/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useMemo, useReducer } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_BASE_URL } from "@/lib/config/constants";
import { useChatSession } from "@/providers/chat-session-provider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function DialogShare() {
	const { chatId } = useChatSession();
	const location = useLocation();
	const pathname = location.pathname;
	const canShare = useMemo(
		() => Boolean(chatId) && pathname?.startsWith("/c/"),
		[chatId, pathname],
	);

	// Load current chat status to know if it's already shared
	const { data: currentChat } = useTanStackQuery({
		...convexQuery(
			api.chats.getChat,
			chatId ? ({ chatId } as unknown as { chatId: Id<"chats"> }) : "skip",
		),
		enabled: Boolean(chatId),
	});

	const isShared = Boolean(currentChat?.public);

	const publishChat = useMutation(api.chats.publishChat);
	const unpublishChat = useMutation(api.chats.unpublishChat);

	type ShareState = {
		open: boolean;
		isLoading: boolean;
		copied: boolean;
		step: "confirm" | "link";
		includeImages: boolean;
		isToggling: boolean;
	};
	type ShareAction =
		| { type: "OPEN_DIALOG"; step: "confirm" | "link"; includeImages: boolean }
		| { type: "CLOSE" }
		| { type: "SET_LOADING"; value: boolean }
		| { type: "SET_STEP"; step: "confirm" | "link" }
		| { type: "SET_INCLUDE_IMAGES"; value: boolean }
		| { type: "SET_TOGGLING"; value: boolean }
		| { type: "SET_COPIED"; value: boolean };

	const [shareState, dispatch] = useReducer(
		(s: ShareState, action: ShareAction): ShareState => {
			switch (action.type) {
				case "OPEN_DIALOG":
					return { ...s, open: true, step: action.step, includeImages: action.includeImages };
				case "CLOSE":
					return { ...s, open: false };
				case "SET_LOADING":
					return { ...s, isLoading: action.value };
				case "SET_STEP":
					return { ...s, step: action.step };
				case "SET_INCLUDE_IMAGES":
					return { ...s, includeImages: action.value };
				case "SET_TOGGLING":
					return { ...s, isToggling: action.value };
				case "SET_COPIED":
					return { ...s, copied: action.value };
			}
		},
		{ open: false, isLoading: false, copied: false, step: "confirm", includeImages: false, isToggling: false },
	);
	const { open, isLoading, copied, step, includeImages, isToggling } = shareState;

	if (!canShare) {
		return null;
	}

	const publicLink = `${APP_BASE_URL}/share/${chatId}`;
	const shareTitle = currentChat?.title || "Chat";

	const onOpenDialog = () => {
		if (isShared) {
			dispatch({ type: "OPEN_DIALOG", step: "link", includeImages: currentChat?.shareAttachments ?? false });
		} else {
			dispatch({ type: "OPEN_DIALOG", step: "confirm", includeImages: false });
		}
	};

	const onCreateLink = async () => {
		if (!chatId) {
			return;
		}
		dispatch({ type: "SET_LOADING", value: true });
		await publishChat({
			chatId: chatId as Id<"chats">,
			hideImages: !includeImages,
		})
			.then(() => {
				dispatch({ type: "SET_STEP", step: "link" });
			})
			.finally(() => {
				dispatch({ type: "SET_LOADING", value: false });
			});
	};

	const handleToggleIncludeImages = async (value: boolean) => {
		dispatch({ type: "SET_INCLUDE_IMAGES", value });
		if (!chatId) {
			return;
		}
		if (step === "link") {
			dispatch({ type: "SET_TOGGLING", value: true });
			await publishChat({
				chatId: chatId as Id<"chats">,
				hideImages: !value,
			}).finally(() => {
				dispatch({ type: "SET_TOGGLING", value: false });
			});
		}
	};

	const onUnshare = async () => {
		if (!chatId) {
			return;
		}
		dispatch({ type: "SET_LOADING", value: true });
		await unpublishChat({ chatId: chatId as Id<"chats"> })
			.then(() => {
				dispatch({ type: "SET_STEP", step: "confirm" });
				dispatch({ type: "SET_INCLUDE_IMAGES", value: false });
			})
			.finally(() => {
				dispatch({ type: "SET_LOADING", value: false });
			});
	};

	const onCopy = async () => {
		await navigator.clipboard.writeText(publicLink);
		dispatch({ type: "SET_COPIED", value: true });
		setTimeout(() => dispatch({ type: "SET_COPIED", value: false }), 1500);
	};

	return (
		<>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							aria-label="Share"
							className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
							disabled={isLoading}
							onClick={onOpenDialog}
							tabIndex={0}
							type="button"
						>
							{isLoading ? (
								<SpinnerGap className="size-5 animate-spin text-muted-foreground transition-colors group-hover:text-foreground" />
							) : (
								<ExportIcon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent>Share chat</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<Dialog
				onOpenChange={(v) => {
					if (v) dispatch({ type: "OPEN_DIALOG", step, includeImages });
					else dispatch({ type: "CLOSE" });
				}}
				open={open}
			>
				<DialogContent className="sm:max-w-[500px]">
					{step === "confirm" ? (
						<>
							<DialogHeader>
								<DialogTitle>Share conversation</DialogTitle>
								<DialogDescription>
									You are sharing the entire conversation. Tool calls are
									redacted for privacy.
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4">
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm">Include attachments/images</span>
									<Switch
										aria-label="Include attachments and images"
										checked={includeImages}
										onCheckedChange={(v) => dispatch({ type: "SET_INCLUDE_IMAGES", value: v })}
									/>
								</div>
							</div>
							<div className="mt-2 flex gap-2">
								<Button
									className="flex-1"
									onClick={() => dispatch({ type: "CLOSE" })}
									variant="outline"
								>
									Close
								</Button>
								<Button
									className="flex-1"
									disabled={isLoading}
									onClick={onCreateLink}
								>
									{isLoading ? (
										<>
											<SpinnerGap className="mr-2 size-4 animate-spin" />
											Creating...
										</>
									) : (
										"Create link"
									)}
								</Button>
							</div>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle>Share conversation</DialogTitle>
								<DialogDescription>
									{isShared ? (
										<>
											A publicly accessible link to this conversation has been
											created. You can manage your shared links in{" "}
											<Link
												className="underline underline-offset-4"
												to="/settings/history"
											>
												your settings
											</Link>
											.
										</>
									) : (
										"Anyone with the link can view a sanitized version of this chat."
									)}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4">
								{/* Settings visible when shared */}
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm">Include attachments/images</span>
									<Switch
										aria-label="Include attachments and images"
										checked={includeImages}
										disabled={isToggling || isLoading}
										onCheckedChange={handleToggleIncludeImages}
									/>
								</div>
								<div className="grid gap-2">
									<div className="flex items-center gap-2">
										<Input
											aria-label="Public share link"
											readOnly
											value={publicLink}
										/>
										<Button onClick={onCopy} variant="outline">
											{copied ? (
												<>
													<Check className="mr-1 size-4" /> Copied
												</>
											) : (
												<>
													<Copy className="mr-1 size-4" /> Copy
												</>
											)}
										</Button>
									</div>
								</div>
								<div className="mt-2 grid w-full grid-cols-2 gap-2">
									<Button
										aria-label="Share on Twitter"
										className="flex-1"
										onClick={() =>
											window.open(
												`https://x.com/intent/tweet?url=${encodeURIComponent(publicLink)}&text=${encodeURIComponent(shareTitle)}`,
												"_blank",
												"noopener,noreferrer",
											)
										}
										variant="outline"
									>
										<XLogoIcon className="mr-2 size-4" /> Twitter
									</Button>
									<Button
										aria-label="Share on Reddit"
										className="flex-1"
										onClick={() =>
											window.open(
												`https://www.reddit.com/submit?url=${encodeURIComponent(publicLink)}&title=${encodeURIComponent(shareTitle)}`,
												"_blank",
												"noopener,noreferrer",
											)
										}
										variant="outline"
									>
										<RedditLogo className="mr-2 size-4" /> Reddit
									</Button>
									<Button
										aria-label="Share on LinkedIn"
										className="flex-1"
										onClick={() =>
											window.open(
												`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicLink)}`,
												"_blank",
												"noopener,noreferrer",
											)
										}
										variant="outline"
									>
										<LinkedinLogo className="mr-2 size-4" /> LinkedIn
									</Button>
									<Button
										aria-label="Share on Facebook"
										className="flex-1"
										onClick={() =>
											window.open(
												`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicLink)}`,
												"_blank",
												"noopener,noreferrer",
											)
										}
										variant="outline"
									>
										<FacebookLogo className="mr-2 size-4" /> Facebook
									</Button>
								</div>
							</div>
							<div className="mt-2 flex">
								<Button
									className="w-full"
									disabled={isLoading}
									onClick={onUnshare}
									variant="destructive"
								>
									Unshare conversation
								</Button>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
