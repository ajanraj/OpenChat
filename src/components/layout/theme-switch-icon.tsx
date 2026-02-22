import { Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme-provider";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

function useIsHydrated(): boolean {
	return useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
}

export default function ThemeSwitchIcon() {
	const { theme, toggleTheme } = useTheme();
	const mounted = useIsHydrated();

	if (!mounted) {
		return null;
	}

	const handleThemeToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
		const { clientX: x, clientY: y } = event;
		toggleTheme({ x, y });
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					aria-label="Switch theme"
					className="group flex items-center justify-center rounded-full p-2 outline-none hover:bg-accent focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
					onClick={handleThemeToggle}
					tabIndex={0}
					type="button"
				>
					{theme === "dark" ? (
						<Sun
							className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
							weight="bold"
						/>
					) : (
						<Moon
							className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
							weight="bold"
						/>
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent>Switch theme</TooltipContent>
		</Tooltip>
	);
}
