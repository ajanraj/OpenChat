import { Eye, EyeSlash } from "@phosphor-icons/react";
import React, { useCallback } from "react";
import { useModifierKey } from "@/lib/hooks/use-modifier-key";
import { MessageUsageCard } from "@/components/layout/settings/message-usage-card";
import { UserAvatar } from "@/components/user/user-avatar";
import { Kbd } from "@/components/ui/kbd";
import { getHighResolutionAvatarUrl } from "@/lib/avatar-utils";
import { useUser } from "@/providers/user-provider";
import type { Doc } from "../../../../convex/_generated/dataModel";

const getDisplayName = (user: Doc<"users"> | null): string => {
	if (!user) {
		return "User";
	}

	if (user.preferredName) {
		return user.preferredName;
	}

	return user.name || "User";
};

function SettingsSidebarComponent() {
	const { user, hasPremium } = useUser();
	const modKey = useModifierKey();

	const [showEmail, setShowEmail] = React.useState<boolean>(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem("showEmail") === "true";
	});

	const highResAvatarUrl = React.useMemo(
		() => getHighResolutionAvatarUrl(user?.image, 384),
		[user?.image]
	);

	const maskEmail = useCallback((email?: string) => {
		if (!email) {
			return "";
		}
		const [local, domain] = email.split("@");
		const tld = domain.substring(domain.lastIndexOf("."));
		const prefix = local.slice(0, 2);
		return `${prefix}*****${tld}`;
	}, []);

	const toggleEmailVisibility = useCallback(() => {
		setShowEmail((prev) => {
			localStorage.setItem("showEmail", (!prev).toString());
			return !prev;
		});
	}, []);

	if (!user) {
		return null;
	}

	return (
		<aside className="w-full space-y-6">
			{/* User Profile */}
			<div className="flex flex-col items-center text-center">
				<UserAvatar
					alt="Profile"
					className="size-36 border-4 border-background shadow-lg"
					imageClassName="object-cover"
					imageSrc={highResAvatarUrl}
					user={user}
				/>
				<h2 className="mt-4 font-semibold text-xl tracking-tight">
					{getDisplayName(user)}
				</h2>
				<button
					className="mt-1 flex cursor-pointer items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					onClick={toggleEmailVisibility}
					type="button"
				>
					<span>{showEmail ? user.email : maskEmail(user.email)}</span>
					{showEmail ? (
						<EyeSlash className="size-3.5" />
					) : (
						<Eye className="size-3.5" />
					)}
				</button>
				<div className="mt-2">
					<span
						className={`inline-flex rounded-full px-2.5 py-1 font-medium text-xs ${
							hasPremium
								? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "bg-muted text-muted-foreground"
						}`}
					>
						{hasPremium ? "Premium Plan" : "Free Plan"}
					</span>
				</div>
			</div>

			{/* Message Usage */}
			<MessageUsageCard />

			{/* Keyboard Shortcuts */}
			<div className="rounded-xl border bg-card p-4">
				<h3 className="mb-4 font-medium text-sm tracking-tight">Shortcuts</h3>
				<div className="space-y-2.5">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs">Search</span>
							<div className="flex items-center gap-1.5 [&_kbd]:px-2.5 [&_kbd]:py-1.5">
									<Kbd>{modKey}</Kbd>
								<Kbd>K</Kbd>
							</div>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs">New Chat</span>
							<div className="flex items-center gap-1.5 [&_kbd]:px-2.5 [&_kbd]:py-1.5">
									<Kbd>{modKey}</Kbd>
								<Kbd>Shift</Kbd>
								<Kbd>O</Kbd>
							</div>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs">Toggle Sidebar</span>
							<div className="flex items-center gap-1.5 [&_kbd]:px-2.5 [&_kbd]:py-1.5">
									<Kbd>{modKey}</Kbd>
								<Kbd>B</Kbd>
							</div>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs">
							Open Model Picker
						</span>
							<div className="flex items-center gap-1.5 [&_kbd]:px-2.5 [&_kbd]:py-1.5">
									<Kbd>{modKey}</Kbd>
								<Kbd>/</Kbd>
							</div>
					</div>
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-xs">
							Delete Current Chat
						</span>
							<div className="flex items-center gap-1.5 [&_kbd]:px-2.5 [&_kbd]:py-1.5">
									<Kbd>{modKey}</Kbd>
								<Kbd>Shift</Kbd>
								<Kbd className="text-[16px] leading-none">⌫</Kbd>
							</div>
					</div>
				</div>
			</div>
		</aside>
	);
}

export const SettingsSidebar = React.memo(SettingsSidebarComponent);
