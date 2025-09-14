"use client";

import { useTheme } from "@/components/theme-provider";
import type { Provider } from "@/lib/config";

type ProviderIconProps = {
  provider: Provider;
  className?: string;
};

export function ProviderIcon({ provider, className }: ProviderIconProps) {
  const { theme } = useTheme();
  const Icon =
    theme === "light" && provider.icon_light
      ? provider.icon_light
      : provider.icon;
  return <Icon className={className} />;
}
