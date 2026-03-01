import { CaretLeft, CaretRight, UserPlus, X } from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useReducer } from "react";
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
import { useCreateProfile } from "@/hooks/use-create-profile";
import { getDefaultIconForIndex } from "@/lib/config/profile-icons";
import type { ProfileIconName } from "@/lib/config/profile-icons";
import { cn } from "@/lib/utils";
import { useChatSession } from "@/providers/chat-session-provider";
import { useProfile } from "@/providers/profile-provider";
import { ProfileIconPicker } from "./profile-icon-picker";
import { PhosphorIcon } from "./phosphor-icon";

interface FormState {
	showForm: boolean;
	name: string;
	selectedIcon: ProfileIconName;
	copyFrom: string | undefined;
	isSubmitting: boolean;
}

type FormAction =
	| { type: "OPEN_FORM"; defaultIcon: ProfileIconName }
	| { type: "CLOSE_FORM" }
	| { type: "SET_NAME"; value: string }
	| { type: "SET_ICON"; value: ProfileIconName }
	| { type: "SET_COPY_FROM"; value: string | undefined }
	| { type: "SUBMIT_START" }
	| { type: "SUBMIT_SUCCESS" }
	| { type: "SUBMIT_ERROR" };

function formReducer(state: FormState, action: FormAction): FormState {
	switch (action.type) {
		case "OPEN_FORM":
			return { ...state, showForm: true, name: "", selectedIcon: action.defaultIcon, copyFrom: undefined };
		case "CLOSE_FORM":
			return { ...state, showForm: false };
		case "SET_NAME":
			return { ...state, name: action.value };
		case "SET_ICON":
			return { ...state, selectedIcon: action.value };
		case "SET_COPY_FROM":
			return { ...state, copyFrom: action.value };
		case "SUBMIT_START":
			return { ...state, isSubmitting: true };
		case "SUBMIT_SUCCESS":
			return { ...state, isSubmitting: false, showForm: false, name: "", copyFrom: undefined };
		case "SUBMIT_ERROR":
			return { ...state, isSubmitting: false };
	}
}

export function SidebarProfileSection() {
	const { profiles, activeProfile, setActiveProfile } = useProfile();
	const { chatId: activeChatId } = useChatSession();

	const [form, dispatch] = useReducer(formReducer, {
		showForm: false,
		name: "",
		selectedIcon: "ChatCircle" as ProfileIconName,
		copyFrom: undefined,
		isSubmitting: false,
	});

	const onCreateSuccess = useCallback((id: Id<"profiles">) => {
		setActiveProfile(id);
		dispatch({ type: "SUBMIT_SUCCESS" });
	}, [setActiveProfile]);
	const createProfile = useCreateProfile(onCreateSuccess);

	const canCreate = profiles.length < 5;
	const canSubmit = form.name.trim().length > 0 && !form.isSubmitting;

	const handleSubmit = useCallback(async () => {
		if (!canSubmit) return;
		const trimmedName = form.name.trim();
		const copyFromId =
			form.copyFrom && form.copyFrom !== "scratch"
				? (form.copyFrom as Id<"profiles">)
				: undefined;
		dispatch({ type: "SUBMIT_START" });
		const result = await createProfile({
			name: trimmedName,
			icon: form.selectedIcon,
			copyFromProfileId: copyFromId,
		});
		if (!result) {
			dispatch({ type: "SUBMIT_ERROR" });
		}
	}, [canSubmit, createProfile, form.name, form.selectedIcon, form.copyFrom]);

	const toggleForm = () => {
		if (form.showForm) {
			dispatch({ type: "CLOSE_FORM" });
		} else {
			dispatch({ type: "OPEN_FORM", defaultIcon: getDefaultIconForIndex(profiles.length) });
		}
	};

	if (profiles.length === 0) return null;

	return (
		<div className="shrink-0 overflow-visible px-2 pb-2">
			{/* Create Form (expandable) */}
			<AnimatePresence>
				{form.showForm && canCreate && (
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
									onChange={(v) => dispatch({ type: "SET_ICON", value: v })}
									value={form.selectedIcon}
								/>

								<Input
									maxLength={50}
									onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
									onKeyDown={(e) => {
										if (e.key === "Enter" && canSubmit) {
											void handleSubmit();
										}
									}}
									placeholder="Profile name"
									value={form.name}
								/>
							</div>

							<Select
								onValueChange={(v) => dispatch({ type: "SET_COPY_FROM", value: v })}
								value={form.copyFrom}
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
					form.showForm && canCreate
						? "rounded-b-xl bg-muted/30"
						: "rounded-xl",
				)}
			>
				{/* Left spacer to balance the add button on the right */}
				{canCreate && (
					<div className="ml-1 size-8 shrink-0" />
				)}

				{/* Left chevron (layout spacer) */}
				<div aria-hidden="true" className="flex shrink-0 items-center justify-center">
					<CaretLeft className="size-5 opacity-0" />
				</div>

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
				<div aria-hidden="true" className="flex shrink-0 items-center justify-center">
					<CaretRight className="size-5 opacity-0" />
				</div>

				{/* Toggle create form */}
				{canCreate && (
					<button
						aria-label={form.showForm ? "Close create profile form" : "Create new profile"}
						className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
						onClick={toggleForm}
						type="button"
					>
						{form.showForm ? <X className="size-5" /> : <UserPlus className="size-5" />}
					</button>
				)}
			</div>
		</div>
	);
}
