import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile } from "../profile-provider";

const useTanStackQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const convexQueryMock = vi.hoisted(() => vi.fn(() => ({})));
const useUserMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
	useQuery: useTanStackQueryMock,
}));

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

vi.mock("@convex-dev/react-query", () => ({
	convexQuery: convexQueryMock,
}));

vi.mock("../user-provider", () => ({
	useUser: useUserMock,
}));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T | PromiseLike<T>) => void = () => {};
	let reject: (reason?: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function flushMicrotasks() {
	return new Promise<void>((resolve) => {
		queueMicrotask(resolve);
	});
}

function TestHarness() {
	const { activeProfile, profiles, setActiveProfile } = useProfile();

	const profileP2 = profiles.find((profile) => profile.name === "P2");
	const profileP3 = profiles.find((profile) => profile.name === "P3");

	if (!profileP2 || !profileP3) {
		throw new Error("missing test profiles");
	}

	return (
		<div>
			<div data-testid="active-profile-id">{activeProfile?._id ?? "none"}</div>
			<button
				data-testid="switch-p2"
				onClick={() => setActiveProfile(profileP2._id)}
				type="button"
			>
				switch p2
			</button>
			<button
				data-testid="switch-p3"
				onClick={() => setActiveProfile(profileP3._id)}
				type="button"
			>
				switch p3
			</button>
		</div>
	);
}

function renderWithProvider(children: ReactNode) {
	return render(<ProfileProvider>{children}</ProfileProvider>);
}

describe("ProfileProvider profile switching", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		useUserMock.mockReturnValue({
			user: {
				_id: "users:u1",
				activeProfileId: "profiles:p1",
				isAnonymous: false,
			},
		});

		useTanStackQueryMock.mockReturnValue({
			data: [
				{
					_id: "profiles:p1",
					_creationTime: 1,
					userId: "users:u1",
					name: "P1",
					icon: "ChatCircle",
					isDefault: true,
					order: 0,
				},
				{
					_id: "profiles:p2",
					_creationTime: 2,
					userId: "users:u1",
					name: "P2",
					icon: "ChatCircle",
					isDefault: false,
					order: 1,
				},
				{
					_id: "profiles:p3",
					_creationTime: 3,
					userId: "users:u1",
					name: "P3",
					icon: "ChatCircle",
					isDefault: false,
					order: 2,
				},
			],
			isLoading: false,
		});
	});

	it("keeps latest optimistic profile after stale failure and falls back on latest failure", async () => {
		const firstSwitchDeferred = createDeferred<null>();
		const secondSwitchDeferred = createDeferred<null>();

		const ensureDefaultMutation = vi.fn(async () => null);
		const setActiveMutation = vi
			.fn()
			.mockReturnValueOnce(firstSwitchDeferred.promise)
			.mockReturnValueOnce(secondSwitchDeferred.promise);
		const updateProfileMutation = vi.fn(async () => null);

		useMutationMock.mockImplementation(
			(mutationRef: Parameters<typeof getFunctionName>[0]) => {
				const functionName = getFunctionName(mutationRef);
				if (functionName === "profiles:ensureDefaultProfile") {
				return ensureDefaultMutation;
				}
				if (functionName === "profiles:setActiveProfile") {
				return setActiveMutation;
				}
				if (functionName === "profiles:updateProfile") {
				return updateProfileMutation;
				}
				throw new Error(`unexpected mutation: ${functionName}`);
			},
		);

		const { getByTestId } = renderWithProvider(<TestHarness />);

		fireEvent.click(getByTestId("switch-p2"));
		fireEvent.click(getByTestId("switch-p3"));

		expect(getByTestId("active-profile-id").textContent).toBe("profiles:p3");

		await act(async () => {
			firstSwitchDeferred.reject(new Error("first switch failed"));
			await flushMicrotasks();
		});

		expect(getByTestId("active-profile-id").textContent).toBe("profiles:p3");

		await act(async () => {
			secondSwitchDeferred.reject(new Error("second switch failed"));
			await flushMicrotasks();
		});

		await waitFor(() => {
			expect(getByTestId("active-profile-id").textContent).toBe("profiles:p1");
		});
	});
});
