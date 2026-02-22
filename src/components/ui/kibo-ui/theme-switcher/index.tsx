import { Monitor, Moon, Sun } from "@phosphor-icons/react";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { motion } from "motion/react";
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type ThemeKey = "light" | "dark" | "system";

const themes: ReadonlyArray<{
	key: ThemeKey;
	icon: typeof Monitor;
	label: string;
}> = [
	{
		key: "system",
		icon: Monitor,
		label: "System theme",
	},
	{
		key: "light",
		icon: Sun,
		label: "Light theme",
	},
	{
		key: "dark",
		icon: Moon,
		label: "Dark theme",
	},
];

export type ThemeSwitcherProps = {
	value?: ThemeKey;
	onChange?: (theme: ThemeKey) => void;
	defaultValue?: ThemeKey;
	className?: string;
};

function useIsHydrated(): boolean {
	return useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
}

export const ThemeSwitcher = ({
	value,
	onChange,
	defaultValue = "system",
	className,
}: ThemeSwitcherProps) => {
	const [theme, setTheme] = useControllableState({
		defaultProp: defaultValue,
		prop: value,
		onChange,
	});
	const mounted = useIsHydrated();

	const handleThemeClick = useCallback(
		(themeKey: ThemeKey) => {
			setTheme(themeKey);
		},
		[setTheme],
	);

	if (!mounted) {
		return null;
	}

	return (
		<div
			className={cn(
				"relative isolate flex h-6 rounded-full bg-background p-0 ring-1 ring-border",
				className,
			)}
		>
			{themes.map(({ key, icon: Icon, label }) => {
				const isActive = theme === key;

				return (
					<button
						aria-label={label}
							className={cn(
								"relative h-6 w-6 rounded-full",
								!isActive && "hover:[&>svg]:text-foreground",
							)}
							key={key}
							onClick={() => handleThemeClick(key)}
							type="button"
						>
						{isActive && (
							<motion.div
								className="absolute inset-0 rounded-full bg-secondary"
								layoutId="activeTheme"
								transition={{ type: "spring", duration: 0.5 }}
							/>
						)}
						<Icon
							className={cn(
								"relative z-10 m-auto h-4 w-4 transition-colors",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
						/>
					</button>
				);
			})}
		</div>
	);
};
