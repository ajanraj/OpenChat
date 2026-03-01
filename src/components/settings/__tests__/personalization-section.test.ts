import { describe, expect, it } from "vitest";
import {
  resolveDraftTargetProfileId,
  shouldDiscardDraftForMissingProfile,
} from "../personalization-section";

describe("shouldDiscardDraftForMissingProfile", () => {
  it("returns true when draft owner profile no longer exists", () => {
    const shouldDiscard = shouldDiscardDraftForMissingProfile({
      draftProfileId: "profile-b",
      profileIds: ["profile-a", "profile-c"],
      isProfilesLoading: false,
    });

    expect(shouldDiscard).toBe(true);
  });

  it("returns false when draft owner profile still exists", () => {
    const shouldDiscard = shouldDiscardDraftForMissingProfile({
      draftProfileId: "profile-b",
      profileIds: ["profile-a", "profile-b"],
      isProfilesLoading: false,
    });

    expect(shouldDiscard).toBe(false);
  });

  it("returns false when profile list is still loading", () => {
    const shouldDiscard = shouldDiscardDraftForMissingProfile({
      draftProfileId: "profile-b",
      profileIds: ["profile-a"],
      isProfilesLoading: true,
    });

    expect(shouldDiscard).toBe(false);
  });

  it("returns false when draft belongs to user-level preferences", () => {
    const shouldDiscard = shouldDiscardDraftForMissingProfile({
      draftProfileId: undefined,
      profileIds: ["profile-a"],
      isProfilesLoading: false,
    });

    expect(shouldDiscard).toBe(false);
  });
});

describe("resolveDraftTargetProfileId", () => {
  it("uses draft profile id when present", () => {
    const targetProfileId = resolveDraftTargetProfileId({
      draftProfileId: "profile-draft",
      activeProfileId: "profile-active",
    });

    expect(targetProfileId).toBe("profile-draft");
  });

  it("falls back to active profile id when draft owner is undefined", () => {
    const targetProfileId = resolveDraftTargetProfileId({
      draftProfileId: undefined,
      activeProfileId: "profile-active",
    });

    expect(targetProfileId).toBe("profile-active");
  });

  it("returns undefined when both ids are undefined", () => {
    const targetProfileId = resolveDraftTargetProfileId({
      draftProfileId: undefined,
      activeProfileId: undefined,
    });

    expect(targetProfileId).toBeUndefined();
  });
});
