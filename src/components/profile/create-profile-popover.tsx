import { UserPlus } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProfile } from "@/providers/profile-provider";
import { ProfileFormFields } from "./profile-form-fields";

export function CreateProfilePopover() {
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
		<Popover onOpenChange={setOpen} open={open}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							type="button"
						>
							<UserPlus className="size-3.5" weight="bold" />
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top">New profile</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="z-[70] w-80" side="top">
				<ProfileFormFields
					existingProfiles={profiles}
					onSubmit={handleSubmit}
				/>
			</PopoverContent>
		</Popover>
	);
}
