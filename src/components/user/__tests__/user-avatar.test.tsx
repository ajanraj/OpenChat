import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "../user-avatar";

describe("UserAvatar", () => {
	it("renders facehash fallback when image is missing", async () => {
		const { container } = render(
			<UserAvatar
				user={{
					email: "ajan@example.com",
					name: "Ajan Raj",
					preferredName: "Ajan",
				}}
			/>,
		);

		await waitFor(() => {
			const fallback = container.querySelector("[data-facehash]");
			expect(fallback).not.toBeNull();
		});
	});

	it("applies round fallback class and shows initial letter", async () => {
		const { container } = render(
			<UserAvatar
				fallbackClassName="bg-muted"
				user={{
					email: "ajan@example.com",
				}}
			/>,
		);

		await waitFor(() => {
			const fallback = container.querySelector("[data-facehash]");
			expect(fallback).not.toBeNull();
			expect(fallback?.className).toContain("rounded-full");
			expect(fallback?.className).toContain("bg-muted");
			expect(container.querySelector("[data-facehash-initial]")).not.toBeNull();
		});
	});

	it("uses facehash fallback for default google avatar image URL", async () => {
		const { container } = render(
			<UserAvatar
				user={{
					email: "ajan@example.com",
					image: "https://lh3.googleusercontent.com/a/default-user=s96-c",
				}}
			/>,
		);

		await waitFor(() => {
			const fallback = container.querySelector("[data-facehash]");
			expect(fallback).not.toBeNull();
		});

		const image = container.querySelector("img");
		expect(image?.getAttribute("src")).toBeUndefined();
	});
});
