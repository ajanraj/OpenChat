import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ICON_MAP, PROFILE_ICONS, getDefaultIconForIndex } from "@/lib/config/profile-icons";
import type { IconWeight, ProfileIconName } from "@/lib/config/profile-icons";
import { cn } from "@/lib/utils";
import type { Profile } from "@/providers/profile-provider";

interface ProfileFormFieldsProps {
	existingProfiles: Profile[];
	onSubmit: (data: { name: string; icon: string; copyFromProfileId?: string }) => void;
	isSubmitting?: boolean;
}

function PhosphorIcon({
	name,
	className,
	weight = "regular",
}: {
	name: string;
	className?: string;
	weight?: IconWeight;
}) {
	const IconComponent = ICON_MAP[name];
	if (!IconComponent) {
		return null;
	}
	return <IconComponent className={className} weight={weight} />;
}

export function ProfileFormFields({
	existingProfiles,
	onSubmit,
	isSubmitting,
}: ProfileFormFieldsProps) {
	const defaultIcon = getDefaultIconForIndex(existingProfiles.length);
	const [name, setName] = useState("");
	const [selectedIcon, setSelectedIcon] = useState<ProfileIconName>(defaultIcon);
	const [copyFrom, setCopyFrom] = useState<string>("scratch");

	const canSubmit = name.trim().length > 0 && !isSubmitting;

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}
		onSubmit({
			name: name.trim(),
			icon: selectedIcon,
			copyFromProfileId: copyFrom !== "scratch" ? copyFrom : undefined,
		});
	};

	// Memoize icon grid to avoid re-renders
	const iconGrid = useMemo(
		() => (
			<div className="grid grid-cols-7 gap-1">
				{PROFILE_ICONS.map((iconName) => (
					<button
						className={cn(
							"flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors",
							selectedIcon === iconName
								? "bg-primary text-primary-foreground"
								: "hover:bg-muted",
						)}
						key={iconName}
						onClick={() => setSelectedIcon(iconName)}
						type="button"
					>
						<PhosphorIcon
							className="size-4"
							name={iconName}
							weight={selectedIcon === iconName ? "fill" : "regular"}
						/>
					</button>
				))}
			</div>
		),
		[selectedIcon],
	);

	return (
		<div className="space-y-4">
			{/* Name input with icon preview */}
			<div className="space-y-2">
				<Label className="text-sm" htmlFor="profile-name">
					Profile Name
				</Label>
				<div className="flex items-center gap-2">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
						<PhosphorIcon className="size-4" name={selectedIcon} weight="fill" />
					</div>
					<Input
						autoFocus
						id="profile-name"
						maxLength={30}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && canSubmit) {
								handleSubmit();
							}
						}}
						placeholder="Work, Personal, Study…"
						value={name}
					/>
				</div>
			</div>

			{/* Icon grid */}
			<div className="space-y-2">
				<Label className="text-sm">Icon</Label>
				{iconGrid}
			</div>

			{/* Copy from selector */}
			{existingProfiles.length > 0 && (
				<div className="space-y-2">
					<Label className="text-sm">Copy settings from</Label>
					<Select onValueChange={setCopyFrom} value={copyFrom}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Start from scratch" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="scratch">Start from scratch</SelectItem>
							{existingProfiles.map((p) => (
								<SelectItem key={p._id} value={p._id}>
									<span className="flex items-center gap-2">
										<PhosphorIcon className="size-3.5" name={p.icon} weight="fill" />
										{p.name}
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			{/* Submit */}
			<Button
				className="w-full cursor-pointer"
				disabled={!canSubmit}
				onClick={handleSubmit}
			>
				Create Profile
			</Button>
		</div>
	);
}

export { PhosphorIcon };
