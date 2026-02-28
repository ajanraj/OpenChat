import type { IconWeight } from "@phosphor-icons/react";
import { ICON_MAP, isProfileIconName } from "@/lib/config/profile-icons";

export function PhosphorIcon({
	name,
	className,
	weight = "regular",
}: {
	name: string;
	className?: string;
	weight?: IconWeight;
}) {
	if (!isProfileIconName(name)) {
		return null;
	}
	const IconComponent = ICON_MAP[name];
	return <IconComponent className={className} weight={weight} />;
}
