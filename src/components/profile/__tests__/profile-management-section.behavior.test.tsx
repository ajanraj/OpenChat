import { fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileManagementSection } from "../profile-management-section";

const useMutationMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

function profileId(value: string) {
	return value as unknown as Id<"profiles">;
}

function userId(value: string) {
	return value as unknown as Id<"users">;
}

type ChildrenProps = {
	children?: ReactNode;
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	size?: string;
	variant?: string;
};

type DialogProps = ChildrenProps & {
	open?: boolean;
};

type SelectProps = ChildrenProps & {
	onValueChange?: (value: string) => void;
	value?: string;
};

type SelectItemProps = ChildrenProps & {
	value: string;
};

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

vi.mock("@/components/profile/create-profile-dialog", () => ({
	CreateProfileDialog: () => <button type="button">Create Profile</button>,
}));

vi.mock("@/components/profile/phosphor-icon", () => ({
	PhosphorIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/components/profile/profile-icon-picker", () => ({
	ProfileIconPicker: () => <button type="button">Icon Picker</button>,
}));

vi.mock("@/components/ui/toast", () => ({
	toast: toastMock,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({ children, ...props }: ButtonProps) => (
		<button {...props} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

vi.mock("@/components/ui/input", () => ({
	Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
	Label: ({ children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
		<label {...props}>{children}</label>
	),
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({ children, open }: DialogProps) => <>{open ? children : null}</>,
	DialogContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	DialogHeader: ({ children }: ChildrenProps) => <div>{children}</div>,
	DialogTitle: ({ children }: ChildrenProps) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
	AlertDialog: ({ children, open }: DialogProps) => <>{open ? children : null}</>,
	AlertDialogAction: ({ children, onClick }: ButtonProps) => (
		<button onClick={onClick} type="button">
			{children}
		</button>
	),
	AlertDialogCancel: ({ children }: ChildrenProps) => <button type="button">{children}</button>,
	AlertDialogContent: ({ children }: ChildrenProps) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: ChildrenProps) => <p>{children}</p>,
	AlertDialogFooter: ({ children }: ChildrenProps) => <div>{children}</div>,
	AlertDialogHeader: ({ children }: ChildrenProps) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: ChildrenProps) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/select", async () => {
	const React = await import("react");
	const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});

	return {
		Select: ({ children, onValueChange }: SelectProps) => (
			<SelectContext.Provider value={{ onValueChange }}>{children}</SelectContext.Provider>
		),
		SelectContent: ({ children, className }: ChildrenProps & { className?: string }) => (
			<div className={className}>{children}</div>
		),
		SelectItem: ({ children, value }: SelectItemProps) => {
			const context = React.useContext(SelectContext);
			return (
				<div
					data-testid={`select-item-${value}`}
					onClick={() => context.onValueChange?.(value)}
					role="option"
				>
					{children}
				</div>
			);
		},
		SelectTrigger: ({ children }: ChildrenProps) => <div>{children}</div>,
		SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
	};
});

const defaultProfile = {
	_id: profileId("profile-default"),
	_creationTime: 1,
	userId: userId("user-1"),
	name: "Default",
	icon: "ChatCircle",
	isDefault: true,
	order: 0,
};

const workProfile = {
	_id: profileId("profile-work"),
	_creationTime: 2,
	userId: userId("user-1"),
	name: "Work",
	icon: "Briefcase",
	isDefault: false,
	order: 1,
};

describe("ProfileManagementSection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useMutationMock.mockReturnValue(vi.fn(async () => {}));
	});

	it("switches profile from the selector", () => {
		const setActiveProfile = vi.fn();

		render(
			<ProfileManagementSection
				activeProfile={defaultProfile}
				profiles={[defaultProfile, workProfile]}
				setActiveProfile={setActiveProfile}
			/>,
		);

		fireEvent.click(screen.getByTestId(`select-item-${workProfile._id}`));

		expect(setActiveProfile).toHaveBeenCalledWith(workProfile._id);
	});

	it("allows editing a non-active profile directly from dropdown options", () => {
		const setActiveProfile = vi.fn();

		render(
			<ProfileManagementSection
				activeProfile={defaultProfile}
				profiles={[defaultProfile, workProfile]}
				setActiveProfile={setActiveProfile}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Edit Work"));

		expect(screen.getByText("Edit Profile")).toBeTruthy();
		expect(screen.getByDisplayValue("Work")).toBeTruthy();
		expect(setActiveProfile).not.toHaveBeenCalled();
	});

	it("keeps default profile delete disabled and opens delete confirmation for non-default profile", () => {
		render(
			<ProfileManagementSection
				activeProfile={defaultProfile}
				profiles={[defaultProfile, workProfile]}
				setActiveProfile={vi.fn()}
			/>,
		);

		const defaultDeleteButton = screen.getByLabelText("Delete Default");
		expect(defaultDeleteButton).toHaveProperty("disabled", true);

		fireEvent.click(screen.getByLabelText("Delete Work"));
		expect(screen.getByText("Delete Profile")).toBeTruthy();
	});
});
