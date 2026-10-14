import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitStatus } from "@/lib/rate-limit-status";
import { MessageUsageCard } from "../message-usage-card";

const useUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/providers/user-provider", () => ({
	useUser: useUserMock,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/mock">{children}</a>,
}));

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const premiumStatus = (premiumRemaining: number): RateLimitStatus => ({
	isPremium: true,
	dailyCount: 0,
	dailyLimit: 0,
	dailyRemaining: 0,
	monthlyCount: 40,
	monthlyLimit: 1500,
	monthlyRemaining: 1460,
	premiumCount: 100 - premiumRemaining,
	premiumLimit: 100,
	premiumRemaining,
	effectiveRemaining: 1460,
});

const renderCard = (rateLimitStatus: RateLimitStatus, hasPremium: boolean) => {
	useUserMock.mockReturnValue({ user: { _id: "user-1" }, rateLimitStatus, hasPremium });
	return render(<MessageUsageCard />);
};

describe("MessageUsageCard", () => {
	beforeEach(() => {
		useUserMock.mockReset();
	});

	it("shows no premium credits left once they are used up", () => {
		const { getByText } = renderCard(premiumStatus(0), true);

		expect(getByText("100 / 100")).toBeTruthy();
		expect(getByText("0 remaining")).toBeTruthy();
	});

	it("shows the premium credits the status has left", () => {
		const { getByText } = renderCard(premiumStatus(75), true);

		expect(getByText("25 / 100")).toBeTruthy();
		expect(getByText("75 remaining")).toBeTruthy();
		expect(getByText("40 / 1500")).toBeTruthy();
	});

	it("follows the status's tier when the premium query disagrees", () => {
		const freeStatus: RateLimitStatus = {
			...premiumStatus(0),
			isPremium: false,
			dailyCount: 3,
			dailyLimit: 10,
			dailyRemaining: 7,
			premiumCount: 0,
			premiumLimit: 0,
			premiumRemaining: 0,
		};
		const { getByText, queryByText } = renderCard(freeStatus, true);

		expect(getByText("3 / 10")).toBeTruthy();
		expect(getByText("7 remaining")).toBeTruthy();
		expect(queryByText("Premium")).toBeNull();
	});
});
