import { CaretLeft, CaretRight, UserPlus, X } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { getDefaultIconForIndex } from "@/lib/config/profile-icons";
import type { ProfileIconName } from "@/lib/config/profile-icons";
import { cn } from "@/lib/utils";
import { useChatSession } from "@/providers/chat-session-provider";
import { useProfile } from "@/providers/profile-provider";
import { ProfileIconPicker } from "./profile-icon-picker";
import { PhosphorIcon } from "./profile-form-fields";

export function SidebarProfileSection() {
	const { profiles, activeProfile, setActiveProfile } = useProfile();
	const { chatId: activeChatId } = useChatSession();
	const createProfile = useMutation(api.profiles.createProfile);

	const [showForm, setShowForm] = useState(false);
	const [name, setName] = useState("");
	const [selectedIcon, setSelectedIcon] = useState<ProfileIconName>(
		getDefaultIconForIndex(profiles.length),
	);
	const [copyFrom, setCopyFrom] = useState<string | undefined>(undefined);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const canCreate = profiles.length < 5;
	const canSubmit = name.trim().length > 0 && !isSubmitting;

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			const newProfileId = await createProfile({
				name: name.trim(),
				icon: selectedIcon,
				copyFromProfileId:
					copyFrom && copyFrom !== "scratch"
						? (copyFrom as Id<"profiles">)
						: undefined,
			});
			setActiveProfile(newProfileId);
			setShowForm(false);
			setName("");
			setCopyFrom(undefined);
			toast({ title: `Profile "${name.trim()}" created`, status: "success" });
		} catch {
			toast({ title: "Failed to create profile", status: "error" });
		} finally {
			setIsSubmitting(false);
		}
	}, [canSubmit, createProfile, name, selectedIcon, copyFrom]);

	const toggleForm = () => {
		if (!showForm) {
			setName("");
			setSelectedIcon(getDefaultIconForIndex(profiles.length));
			setCopyFrom(undefined);
		}
		setShowForm((prev) => !prev);
	};

	if (profiles.length === 0) return null;

	return (
		<div className="shrink-0 overflow-visible px-2 pb-2">
			{/* Create Form (expandable) */}
			<AnimatePresence>
				{showForm && canCreate && (
					<m.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						<div className="flex flex-col gap-3 rounded-t-xl bg-muted/30 p-3">
							<div className="flex flex-col gap-0.5">
								<div className="font-medium text-sm">Create a Profile</div>
								<div className="text-muted-foreground text-xs">
									Profiles have separate threads and settings
								</div>
							</div>

							<div className="flex gap-2">
								<ProfileIconPicker
									onChange={setSelectedIcon}
									value={selectedIcon}
								/>

								<Input
									maxLength={50}
									onChange={(e) => setName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && canSubmit) {
											void handleSubmit();
										}
									}}
									placeholder="Profile name"
									value={name}
								/>
							</div>

							<Select
								onValueChange={setCopyFrom}
								value={copyFrom}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Copy settings from..." />
								</SelectTrigger>
								<SelectContent className="z-[80]" side="top">
									<SelectItem value="scratch">Start from scratch</SelectItem>
									<SelectSeparator />
									{profiles.map((p) => (
										<SelectItem key={p._id} value={p._id}>
											<span className="flex items-center gap-2">
												<PhosphorIcon
													className="size-3.5"
													name={p.icon}
													weight="fill"
												/>
												{p.name}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Button
								className="w-full cursor-pointer"
								disabled={!canSubmit}
								onClick={() => void handleSubmit()}
								size="sm"
							>
								Create Profile
							</Button>
						</div>
					</m.div>
				)}
			</AnimatePresence>

			{/* Profile Bar */}
			<div
				className={cn(
					"flex items-center px-2 py-1.5 transition-colors duration-200 ease-out",
					showForm && canCreate
						? "rounded-b-xl bg-muted/30"
						: "rounded-xl",
				)}
			>
				{/* Left spacer to balance the add button on the right */}
				{canCreate && (
					<div className="ml-1 size-8 shrink-0" />
				)}

				{/* Left chevron (layout spacer) */}
				<button
					aria-label="Previous profile"
					className="pointer-events-none flex shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all"
					disabled
					type="button"
				>
					<CaretLeft className="size-5" />
				</button>

				{/* Profile Icons */}
				<div className="relative flex flex-1 items-center justify-center overflow-hidden">
					<div className="flex items-center justify-center gap-2">
						{profiles.map((p) => (
							<Tooltip key={p._id}>
								<TooltipTrigger asChild>
									<button
										aria-label={p.name}
										className={cn(
											"flex shrink-0 cursor-pointer items-center justify-center rounded-lg text-sm transition-all",
											activeProfile?._id === p._id
												? "text-muted-foreground"
												: "text-muted-foreground/80 hover:text-muted-foreground",
										)}
										onClick={() => setActiveProfile(p._id, activeChatId)}
										type="button"
									>
										<PhosphorIcon
											className="size-5"
											name={p.icon}
											weight={
												activeProfile?._id === p._id ? "fill" : "regular"
											}
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent side="top">{p.name}</TooltipContent>
							</Tooltip>
						))}
					</div>
				</div>

				{/* Right chevron (layout spacer) */}
				<button
					aria-label="Next profile"
					className="pointer-events-none flex shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all"
					disabled
					type="button"
				>
					<CaretRight className="size-5" />
				</button>

				{/* Toggle create form */}
				{canCreate && (
					<button
						className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
						onClick={toggleForm}
						type="button"
					>
						{showForm ? <X className="size-5" /> : <UserPlus className="size-5" />}
					</button>
				)}
			</div>
		</div>
	);
}
