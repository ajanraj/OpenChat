"use client";

import { useTheme } from "@/components/theme-provider";
import type { ConnectorConfig } from "@/lib/config/tools";

type ConnectorIconProps = {
  connector: ConnectorConfig;
  className?: string;
};

export function ConnectorIcon({ connector, className }: ConnectorIconProps) {
  const { theme } = useTheme();
  const Icon =
    theme === "light" && connector.icon_light
      ? connector.icon_light
      : connector.icon;
  return <Icon className={className} />;
}
