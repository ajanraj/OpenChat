import type { ConnectorConfig } from "@/lib/config/tools";
import { cn } from "@/lib/utils";

type ConnectorIconProps = {
	connector: ConnectorConfig;
	className?: string;
};

// Renders both variants and lets CSS pick, so the server render matches the stored theme
export function ConnectorIcon({ connector, className }: ConnectorIconProps) {
	const LightIcon = connector.icon_light;
	if (!LightIcon) {
		return <connector.icon className={className} />;
	}
	return (
		<>
			<LightIcon className={cn(className, "dark:hidden")} />
			<connector.icon className={cn(className, "hidden dark:inline")} />
		</>
	);
}
