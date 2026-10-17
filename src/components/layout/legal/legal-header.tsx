import { List, X } from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { APP_NAME } from "@/lib/config/constants";

const LEGAL_NAV_ITEMS = [
	{ name: "Privacy Policy", href: "/privacy" },
	{ name: "Terms of Service", href: "/terms" },
	{ name: "Security Policy", href: "/security" },
] as const;

type LogoSectionProps = {
	appName: string;
};

function LogoSection({ appName }: LogoSectionProps) {
	return (
		<div className="flex items-center">
			<Link className="flex items-center gap-3" to="/">
				<img
					alt={`${appName} Logo`}
					className="size-8"
					height={32}
					src="/favicon.ico"
					width={32}
				/>
				<span className="font-semibold text-xl tracking-tight">
					{appName.trim().toLowerCase()}
				</span>
			</Link>
		</div>
	);
}

type DesktopNavigationProps = {
	activeTab: string | undefined;
	navItems: typeof LEGAL_NAV_ITEMS;
};

function DesktopNavigation({ activeTab, navItems }: DesktopNavigationProps) {
	return (
		<Tabs value={activeTab}>
			<TabsList className="h-auto p-1">
				{navItems.map((item) => (
					<TabsTrigger asChild key={item.href} value={item.href}>
						<Link to={item.href}>{item.name}</Link>
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

type MobileHamburgerMenuProps = {
	isOpen: boolean;
	onToggle: () => void;
};

function MobileHamburgerMenu({ isOpen, onToggle }: MobileHamburgerMenuProps) {
	return (
		<div className="md:hidden">
			<Button
				aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
				onClick={onToggle}
				size="icon"
				variant="ghost"
			>
				{isOpen ? <X className="size-6" /> : <List className="size-6" />}
			</Button>
		</div>
	);
}

function LegalHeaderComponent() {
	const { pathname } = useLocation();
	const isMobile = useBreakpoint(768);
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	const showMobileNav = isMobile && isMobileMenuOpen;

	// Determine the active tab by finding exact pathname match
	const activeTab = LEGAL_NAV_ITEMS.find(
		(item) => pathname === item.href,
	)?.href;

	const toggleMobileMenu = () => {
		setIsMobileMenuOpen(!isMobileMenuOpen);
	};

	return (
		<div className="border-border border-b bg-background">
			<div className="container mx-auto max-w-5xl px-4 py-6">
				{/* Single line header with logo on left and navigation on right */}
				<div className="flex items-center justify-between">
					<LogoSection appName={APP_NAME} />

					{/* Desktop navigation on the right */}
					{!isMobile && (
						<DesktopNavigation
							activeTab={activeTab}
							navItems={LEGAL_NAV_ITEMS}
						/>
					)}

					{/* Mobile hamburger menu */}
					{isMobile ? (
						<MobileHamburgerMenu
							isOpen={isMobileMenuOpen}
							onToggle={toggleMobileMenu}
						/>
					) : null}
				</div>

				{/* Mobile navigation menu - shows below header when open */}
				{showMobileNav ? (
					<div className="mt-6 border-border border-t pt-6">
						<nav className="flex flex-col space-y-2">
							{LEGAL_NAV_ITEMS.map((item) => {
								const isActive = pathname === item.href;
								return (
									<Link
										className={`rounded-lg px-3 py-3 text-base transition-colors ${
											isActive
												? "bg-accent font-medium text-accent-foreground"
												: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
										}`}
										key={item.href}
										onClick={() => setIsMobileMenuOpen(false)}
										to={item.href}
									>
										{item.name}
									</Link>
								);
							})}
						</nav>
					</div>
				) : null}
			</div>
		</div>
	);
}

export const LegalHeader = React.memo(LegalHeaderComponent);
