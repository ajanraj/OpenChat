import type { Provider } from "@/lib/config";
import { cn } from "@/lib/utils";

type ProviderIconProps = {
	provider: Provider;
	className?: string;
};

// Renders both variants and lets CSS pick, so the server render matches the stored theme
export function ProviderIcon({ provider, className }: ProviderIconProps) {
	const LightIcon = provider.icon_light;
	if (!LightIcon) {
		return <provider.icon className={className} />;
	}
	return (
		<>
			<LightIcon className={cn(className, "dark:hidden")} />
			<provider.icon className={cn(className, "hidden dark:inline")} />
		</>
	);
}
