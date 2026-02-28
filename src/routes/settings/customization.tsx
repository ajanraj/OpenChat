import { createFileRoute } from "@tanstack/react-router";
import { ProfileManagementSection } from "@/components/profile/profile-management-section";
import { PersonalizationSection } from "@/components/settings/personalization-section";
import { VisualOptionsSection } from "@/components/settings/visual-options-section";
import { useProfile } from "@/providers/profile-provider";
import { useUser } from "@/providers/user-provider";

export const Route = createFileRoute("/settings/customization")({
  component: CustomizationSettingsPage,
});

export function CustomizationSettingsPage() {
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const { user } = useUser();

  return (
    <div className="space-y-8">
      <ProfileManagementSection
        activeProfile={activeProfile}
        profiles={profiles}
        setActiveProfile={setActiveProfile}
      />

      <PersonalizationSection activeProfile={activeProfile} user={user} />

      <VisualOptionsSection />
    </div>
  );
}
