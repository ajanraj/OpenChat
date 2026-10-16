import {
	CheckCircleIcon,
	GithubLogoIcon,
	InfoIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { memo } from "react";
import { UpgradeButton } from "@/components/common/upgrade-button";
import { HistoryTrigger } from "@/components/history/history-trigger";
import { AppInfoTrigger } from "@/components/layout/app-info/app-info-trigger";
import { DialogShare } from "@/components/layout/dialog-share";
import { UserMenu } from "@/components/layout/user-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { GITHUB_REPO_URL } from "@/lib/config/constants";
import { useUser } from "@/providers/user-provider";

export const Header = memo(function HeaderComponent() {
	const router = useRouter();
	const location = useLocation();
	const pathname = location.pathname;
	const { user, isLoading } = useUser();
	const isLoggedIn = Boolean(user) && !user?.isAnonymous;
	// Server render and first paint can't know the session yet: show neither set of actions so a
	// returning user never sees the logged-out ones flash
	const isSessionPending = !user && isLoading;
	const isMobile = useBreakpoint(768);

	const showNewChatButton = isMobile && pathname !== "/";
	const showTasksButton = isMobile && pathname === "/";

	return (
		<header className="fixed top-0 right-0 left-0 z-50 h-app-header">
			<div className="pointer-events-none absolute top-app-header left-0 z-50 mx-auto h-app-header w-full bg-background to-transparent backdrop-blur-xl [-webkit-mask-image:linear-gradient(to_bottom,black,transparent)] lg:hidden" />
			<div className="relative mx-auto flex h-full items-center justify-between bg-background px-4 sm:px-6 lg:bg-transparent lg:px-8">
				{/* Logo on mobile */}
				<div className="flex items-center md:hidden">
					<Link className="flex items-center" to="/">
						<img
							alt="oschat Logo"
							className="dark:hidden"
							height={28}
							src="/oschat_logo_light.svg"
							width={100}
						/>
						<img
							alt="oschat Logo"
							className="hidden dark:block"
							height={28}
							src="/oschat_logo_dark.svg"
							width={100}
						/>
					</Link>
				</div>

				{/* Hidden placeholder to prevent layout shift on desktop */}
				<div className="hidden w-24 md:block" />

				{isSessionPending ? null : isLoggedIn ? (
					<div className="flex items-center gap-4">
						{/* Mobile button for new chat */}
						{showNewChatButton ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										aria-label="New Chat"
										className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={() => router.navigate({ to: "/" })}
										type="button"
									>
										<PlusIcon size={24} />
									</button>
								</TooltipTrigger>
								<TooltipContent>New Chat</TooltipContent>
							</Tooltip>
						) : null}
						{/* Tasks button - mobile only, home page only */}
						{showTasksButton ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										aria-label="Background Agents"
										className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={() => router.navigate({ to: "/tasks" })}
										type="button"
									>
										<CheckCircleIcon size={24} />
									</button>
								</TooltipTrigger>
								<TooltipContent>Background Agents</TooltipContent>
							</Tooltip>
						) : null}
						{/* Mobile: Share first, then History for better UX */}
						{isMobile ? (
							<>
								<DialogShare />
								<HistoryTrigger />
							</>
						) : null}
						{/* Desktop: History first (hidden), then Share to avoid gap */}
						{!isMobile && (
							<>
								<HistoryTrigger />
								<DialogShare />
							</>
						)}
						{(!isMobile || pathname === "/" || pathname === "/tasks") && (
							<UpgradeButton />
						)}
						{user ? <UserMenu user={user} /> : null}
					</div>
				) : (
					<div className="flex items-center gap-4">
						<Tooltip>
							<TooltipTrigger asChild>
								<a
									aria-label="View on GitHub"
									className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
									href={GITHUB_REPO_URL}
									rel="noopener noreferrer"
									target="_blank"
								>
									<GithubLogoIcon
										aria-hidden="true"
										className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
										weight="bold"
									/>
								</a>
							</TooltipTrigger>
							<TooltipContent>View on GitHub</TooltipContent>
						</Tooltip>
						<AppInfoTrigger
							trigger={
								<button
									aria-label={"About"}
									className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
									tabIndex={0}
									type="button"
								>
									<InfoIcon
										className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
										weight="bold"
									/>
								</button>
							}
						/>
						<Link
							className="font-base text-base text-muted-foreground transition-colors hover:text-foreground"
							to="/auth"
						>
							Login
						</Link>
					</div>
				)}
			</div>
		</header>
	);
});
