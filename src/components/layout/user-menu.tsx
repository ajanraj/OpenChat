import {
	ChatCircleDotsIcon,
	Eye,
	EyeSlash,
	PaletteIcon,
	SignOut,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import React from "react";
import { UserAvatar } from "@/components/user/user-avatar";
import { useTheme } from "@/components/theme-provider";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/components/ui/kibo-ui/theme-switcher";
import { toast } from "@/components/ui/toast";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUser } from "@/providers/user-provider";
import type { Doc } from "../../../convex/_generated/dataModel";
import { AppInfoTrigger } from "./app-info/app-info-trigger";
import { SettingsTrigger } from "./settings/settings-trigger";

const getDisplayName = (user: Doc<"users">) => user.preferredName || user.name || "User";

export function UserMenu({ user }: { user: Doc<"users"> }) {
	const { signOut } = useUser();
	const { setTheme } = useTheme();
	const router = useRouter();
	const [isMenuOpen, setMenuOpen] = React.useState(false);
	const [isSettingsOpen, setSettingsOpen] = React.useState(false);

	// Track theme preference including system option
	const [themePreference, setThemePreference] = React.useState<
		"light" | "dark" | "system"
	>(() => {
		if (typeof window === "undefined") {
			return "system";
		}
		return (
			(localStorage.getItem("themePreference") as
				| "light"
				| "dark"
				| "system") || "system"
		);
	});

	const [showEmail, setShowEmail] = React.useState<boolean>(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem("showEmail") === "true";
	});

	const maskEmail = (email?: string) => {
		if (!email) {
			return "";
		}
		const [local, domain] = email.split("@");
		const tld = domain.substring(domain.lastIndexOf("."));
		const prefix = local.slice(0, 2);
		return `${prefix}*****${tld}`;
	};

	const handleSettingsOpenChange = (isOpen: boolean) => {
		setSettingsOpen(isOpen);
		if (!isOpen) {
			setMenuOpen(false);
		}
	};

	const handleSignOut = async () => {
		try {
			await signOut();
			toast({ title: "Logged out", status: "success" });
			router.navigate({ to: "/" });
		} catch {
			toast({ title: "Failed to sign out", status: "error" });
		}
	};

	const handleThemeChange = React.useCallback(
		(newTheme: "light" | "dark" | "system") => {
			setThemePreference(newTheme);
			localStorage.setItem("themePreference", newTheme);

			if (newTheme === "system") {
				// Apply system preference
				const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
					.matches
					? "dark"
					: "light";
				setTheme(systemTheme);
			} else {
				setTheme(newTheme);
			}
		},
		[setTheme],
	);

	// Listen for system theme changes when in system mode
	React.useEffect(() => {
		if (themePreference !== "system") {
			return;
		}

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleSystemThemeChange = (e: MediaQueryListEvent) => {
			setTheme(e.matches ? "dark" : "light");
		};

		mediaQuery.addEventListener("change", handleSystemThemeChange);
		return () =>
			mediaQuery.removeEventListener("change", handleSystemThemeChange);
	}, [themePreference, setTheme]);

	return (
		<DropdownMenu modal={false} onOpenChange={setMenuOpen} open={isMenuOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger>
						<UserAvatar
							alt="Profile"
							className="border-2 border-background shadow-lg"
							user={user}
						/>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Profile</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				className="w-56"
				forceMount
				onCloseAutoFocus={(e) => e.preventDefault()}
				onEscapeKeyDown={(e) => {
					if (isSettingsOpen) {
						e.preventDefault();
						return;
					}
				}}
				onInteractOutside={(e) => {
					if (isSettingsOpen) {
						e.preventDefault();
						return;
					}
					setMenuOpen(false);
				}}
			>
				<DropdownMenuItem className="flex flex-col items-start gap-0 no-underline hover:bg-transparent focus:bg-transparent">
					<span>{getDisplayName(user)}</span>
					<button
						className="flex items-center gap-1 text-muted-foreground"
						onClick={(e) => {
							e.stopPropagation();
							setShowEmail((prev) => {
								localStorage.setItem("showEmail", (!prev).toString());
								return !prev;
							});
						}}
						type="button"
					>
						<span>{showEmail ? user?.email : maskEmail(user?.email)}</span>
						{showEmail ? (
							<EyeSlash className="size-4" />
						) : (
							<Eye className="size-4" />
						)}
					</button>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="flex items-center justify-between py-1 hover:bg-transparent focus:bg-transparent"
					onSelect={(e) => e.preventDefault()}
				>
					<span className="flex items-center">
						<PaletteIcon className="mr-2 size-4" />
						Theme
					</span>
					<ThemeSwitcher
						className="scale-100"
						defaultValue="system"
						onChange={handleThemeChange}
						value={themePreference}
					/>
				</DropdownMenuItem>
				<SettingsTrigger
					isMenuItem={true}
					onOpenChange={handleSettingsOpenChange}
				/>
				<DropdownMenuItem
					onSelect={() => {
						window.open(
							"https://oschat.userjot.com",
							"_blank",
							"noopener,noreferrer",
						);
					}}
				>
					<ChatCircleDotsIcon className="size-4" />
					Feedback
				</DropdownMenuItem>
				<AppInfoTrigger />
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={(e) => {
						e.preventDefault();
						handleSignOut();
					}}
				>
					<SignOut className="mr-2 size-4" />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
