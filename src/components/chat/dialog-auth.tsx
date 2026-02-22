import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

type DialogAuthProps = {
	open: boolean;
	setOpenAction: (open: boolean) => void;
};

const getSignInErrorMessage = (err: unknown): string => {
	if (err instanceof Error) {
		return err.message || "An unexpected error occurred. Please try again.";
	}
	return "An unexpected error occurred. Please try again.";
};

export function DialogAuth({ open, setOpenAction }: DialogAuthProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { signIn } = useAuthActions();

	const handleSignInWithGoogle = async () => {
		setIsLoading(true);
		setError(null);
		await signIn("google")
			.then(() => {
				setOpenAction(false);
			})
			.catch((err: unknown) => {
				setError(getSignInErrorMessage(err));
			})
			.finally(() => {
				setIsLoading(false);
			});
	};

	return (
		<Dialog onOpenChange={setOpenAction} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogDescription className="sr-only">
					Authenticate with your account to access the chat application.
				</DialogDescription>
				<DialogHeader>
					<DialogTitle className="text-xl">
						You&apos;ve reached the limit for today
					</DialogTitle>
					<DialogDescription className="pt-2 text-base">
						Sign in below to increase your message limits.
					</DialogDescription>
				</DialogHeader>
				{error ? (
					<div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
						{error}
					</div>
				) : null}
				<DialogFooter className="mt-6 sm:justify-center">
					<Button
						className="w-full text-base"
						disabled={isLoading}
						onClick={handleSignInWithGoogle}
						size="lg"
						variant="secondary"
					>
						<img
							alt="Google logo"
							className="mr-2 size-4"
							height={20}
							src="https://www.google.com/favicon.ico"
							width={20}
						/>
						<span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
