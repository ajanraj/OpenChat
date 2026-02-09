import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { cn } from "@/lib/utils";
import { getUserAvatarSeed, type AvatarUserData } from "@/lib/avatar-utils";

const USER_AVATAR_COLOR_CLASSES = [
	"bg-pink-500/20 dark:bg-pink-500/90",
	"bg-amber-500/20 dark:bg-amber-500/90",
	"bg-blue-500/20 dark:bg-blue-500/90",
	"bg-orange-500/20 dark:bg-orange-500/90",
	"bg-emerald-500/20 dark:bg-emerald-500/90",
];

type UserAvatarProps = {
	user: AvatarUserData | null | undefined;
	className?: string;
	imageClassName?: string;
	fallbackClassName?: string;
	alt?: string;
	imageSrc?: string | null;
};

export function UserAvatar({
	user,
	className,
	imageClassName,
	fallbackClassName,
	alt = "User avatar",
	imageSrc,
}: UserAvatarProps) {
	const seed = getUserAvatarSeed(user);

	return (
		<Avatar
			className={cn(
				"relative flex size-8 shrink-0 overflow-hidden rounded-full",
				className,
			)}
		>
			<AvatarImage
				alt={alt}
				className={cn("aspect-square size-full object-cover", imageClassName)}
				src={imageSrc ?? user?.image}
			/>
			<AvatarFallback
				facehashProps={{
					className: cn(
						"rounded-full text-black transition-transform duration-200 [&_svg]:fill-current",
						fallbackClassName,
					),
					colorClasses: USER_AVATAR_COLOR_CLASSES,
					enableBlink: true,
					intensity3d: "dramatic",
					interactive: true,
					showInitial: true,
					variant: "gradient",
				}}
				name={seed}
			/>
		</Avatar>
	);
}
