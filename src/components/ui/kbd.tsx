import * as React from "react";
import { cn } from "@/lib/utils";

const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
	({ className, ...props }, ref) => {
		return (
				<kbd
					ref={ref}
					className={cn(
						"rounded-md border border-border bg-muted px-2 py-1 font-medium text-muted-foreground text-xs dark:border-border/80 dark:bg-muted/80 dark:text-foreground",
						className,
					)}
					{...props}
				/>
		);
	},
);
Kbd.displayName = "Kbd";

export { Kbd };
