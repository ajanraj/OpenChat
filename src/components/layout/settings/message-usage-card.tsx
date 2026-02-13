import { Info } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import calendar from "dayjs/plugin/calendar";
import isToday from "dayjs/plugin/isToday";
import isTomorrow from "dayjs/plugin/isTomorrow";
import React, { useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PREMIUM_CREDITS } from "@/lib/config";
import { useUser } from "@/providers/user-provider";

dayjs.extend(calendar);
dayjs.extend(isToday);
dayjs.extend(isTomorrow);

function MessageUsageCardComponent() {
	const { user, rateLimitStatus, hasPremium } = useUser();

	const formatResetDate = useCallback(
		(timestamp: number | null | undefined) => {
			if (!timestamp) {
				return "Not available";
			}
			try {
				const resetDate = dayjs(timestamp);

				return resetDate.calendar(null, {
					sameDay: "[today at] h:mm A",
					nextDay: "[tomorrow at] h:mm A",
					nextWeek() {
						return resetDate.format("MMM D [at] h:mm A");
					},
					lastDay: "[yesterday at] h:mm A",
					lastWeek() {
						return resetDate.format("MMM D [at] h:mm A");
					},
					sameElse() {
						if (resetDate.year() === dayjs().year()) {
							return resetDate.format("MMM D [at] h:mm A");
						}
						return resetDate.format("MMM D, YYYY [at] h:mm A");
					},
				});
			} catch {
				return "Error calculating reset time";
			}
		},
		[]
	);

	if (!(user && rateLimitStatus)) {
		return null;
	}

	const resetTimestamp = hasPremium
		? rateLimitStatus.monthlyReset
		: rateLimitStatus.dailyReset;
	const nextResetDateStr = formatResetDate(resetTimestamp);

	const standardLimit = hasPremium
		? rateLimitStatus.monthlyLimit
		: rateLimitStatus.dailyLimit;
	const standardCount = hasPremium
		? rateLimitStatus.monthlyCount
		: rateLimitStatus.dailyCount;
	const standardRemaining = hasPremium
		? rateLimitStatus.monthlyRemaining
		: rateLimitStatus.dailyRemaining;

	const premiumLimit = PREMIUM_CREDITS;
	const premiumCount = rateLimitStatus.premiumCount || 0;
	const premiumRemaining = rateLimitStatus.premiumRemaining || premiumLimit;

	return (
		<div className="rounded-xl border bg-card p-4">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="font-medium text-sm tracking-tight">Usage</h3>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex cursor-default items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
							<span className="font-medium">Resets</span>
							<span className="font-mono tabular-nums">{nextResetDateStr}</span>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{resetTimestamp
								? dayjs(resetTimestamp).format("M/D/YYYY, h:mm:ss A")
								: "Not available"}
						</p>
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="space-y-4">
				{/* Standard Credits */}
				<div className="space-y-2">
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Standard</span>
						<span className="font-medium">
							{standardCount} / {standardLimit}
						</span>
					</div>
					<Progress
						className="h-1.5"
						value={Math.min((standardCount / standardLimit) * 100, 100)}
					/>
					<p className="text-muted-foreground text-[10px]">
						{standardRemaining} remaining
					</p>
				</div>

				{/* Premium Credits */}
				{Boolean(hasPremium) && (
					<div className="space-y-2">
						<div className="flex items-center justify-between text-xs">
							<span className="flex items-center gap-1 text-muted-foreground">
								Premium
								<Tooltip>
									<TooltipTrigger>
										<Info className="size-3" />
									</TooltipTrigger>
									<TooltipContent>
										<p>
											Premium credits are used for models marked with a gem icon in the model
											selector.{" "}
											<Link
												className="underline underline-offset-2"
												search={{ tier: "premium" }}
												to="/settings/models"
											>
												See all premium models
											</Link>
										</p>
									</TooltipContent>
								</Tooltip>
							</span>
							<span className="font-medium">
								{premiumCount} / {premiumLimit}
							</span>
						</div>
						<Progress
							className="h-1.5"
							value={Math.min((premiumCount / premiumLimit) * 100, 100)}
						/>
						<p className="text-muted-foreground text-[10px]">
							{premiumRemaining} remaining
						</p>
					</div>
				)}
			</div>

			<p className="mt-4 pt-3 text-muted-foreground text-xs italic leading-relaxed">
				<Info className="mr-1 inline size-3 align-text-top" />
				Each successful web search call used in a reply consumes 1 additional standard
				credit. Models may not always use search when it is enabled.
			</p>
		</div>
	);
}

export const MessageUsageCard = React.memo(MessageUsageCardComponent);
