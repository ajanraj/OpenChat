import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Plus } from "@phosphor-icons/react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { useProfile } from "@/providers/profile-provider";
import { ProfileFormFields } from "./profile-form-fields";

export function CreateProfileDialog() {
	const [open, setOpen] = useState(false);
	const { profiles } = useProfile();
	const createProfile = useMutation(api.profiles.createProfile);

	const handleSubmit = useCallback(
		async (data: { name: string; icon: string; copyFromProfileId?: string }) => {
			try {
				await createProfile({
					name: data.name,
					icon: data.icon,
					copyFromProfileId: data.copyFromProfileId as Id<"profiles"> | undefined,
				});
				setOpen(false);
				toast({ title: `Profile "${data.name}" created`, status: "success" });
			} catch {
				toast({ title: "Failed to create profile", status: "error" });
			}
		},
		[createProfile],
	);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<button
							className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-muted-foreground/40 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							type="button"
						>
							<Plus className="size-3.5" weight="bold" />
						</button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>New profile</TooltipContent>
			</Tooltip>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Create Profile</DialogTitle>
				</DialogHeader>
				<ProfileFormFields
					existingProfiles={profiles}
					onSubmit={handleSubmit}
				/>
			</DialogContent>
		</Dialog>
	);
}
