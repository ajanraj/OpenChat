import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { MODEL_DEFAULT, RECOMMENDED_MODELS } from "../src/lib/config";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

const GOOGLE_PEOPLE_PHOTOS_ENDPOINT =
  "https://people.googleapis.com/v1/people/me?personFields=photos";

// Helper function to initialize user fields
const initializeUserFields = () => ({
  preferredModel: MODEL_DEFAULT,
  // By default no models are disabled – an empty array means all are enabled
  disabledModels: [],
  // Initialize with recommended models as favorites
  favoriteModels: [...RECOMMENDED_MODELS],
});

// Helper function to initialize rate limits for new user
const initializeRateLimits = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  isAnonymous: boolean,
): Promise<void> => {
  try {
    const rateLimitPromises: Promise<unknown>[] = [];

    // Daily limits based on user type
    const dailyLimitName = isAnonymous ? "anonymousDaily" : "authenticatedDaily";
    rateLimitPromises.push(
      rateLimiter.limit(ctx, dailyLimitName, {
        key: userId,
        count: 0,
      }),
    );

    // Monthly limits for all users
    rateLimitPromises.push(
      rateLimiter.limit(ctx, "standardMonthly", {
        key: userId,
        count: 0,
      }),
    );

    // Initialize premium credits counter for all users (will only be used by premium users)
    rateLimitPromises.push(
      rateLimiter.limit(ctx, "premiumMonthly", {
        key: userId,
        count: 0,
      }),
    );

    await Promise.all(rateLimitPromises);
  } catch (error) {
    console.error("Failed to initialize rate limits:", error);
  }
};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const getObjectField = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  return Reflect.get(value, key);
};

const isPrimaryGooglePhoto = (photo: unknown): boolean => {
  const metadata = getObjectField(photo, "metadata");
  return getObjectField(metadata, "primary") === true;
};

const selectPrimaryGooglePhoto = (payload: unknown): unknown => {
  const photos = getObjectField(payload, "photos");
  if (!Array.isArray(photos) || photos.length === 0) {
    return undefined;
  }
  const primaryPhoto = photos.find((photo) => isPrimaryGooglePhoto(photo));
  return primaryPhoto ?? photos[0];
};

const getGooglePhotoDefaultFlag = (photo: unknown): boolean | undefined => {
  const defaultFlag = getObjectField(photo, "default");
  return typeof defaultFlag === "boolean" ? defaultFlag : undefined;
};

const getGooglePhotoUrl = (photo: unknown): string | undefined => {
  const url = getObjectField(photo, "url");
  return typeof url === "string" ? url : undefined;
};

const fetchGooglePrimaryPhoto = async (
  accessToken: string,
): Promise<{ defaultFlag?: boolean; url?: string }> => {
  try {
    const response = await fetch(GOOGLE_PEOPLE_PHOTOS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return {};
    }

    const payload = await response.json();
    const primaryPhoto = selectPrimaryGooglePhoto(payload);
    if (!primaryPhoto) {
      return {};
    }

    return {
      defaultFlag: getGooglePhotoDefaultFlag(primaryPhoto),
      url: getGooglePhotoUrl(primaryPhoto),
    };
  } catch {
    return {};
  }
};

const resolveOAuthProfileImage = (profile: Record<string, unknown>): string | undefined => {
  const image = readString(profile.image);
  if (image !== undefined) {
    return image;
  }
  return readString(profile.picture);
};

const getOAuthProfileUpdates = (
  profile: Record<string, unknown>,
): { email?: string; image?: string; name?: string } => {
  const updates: { email?: string; image?: string; name?: string } = {};
  const name = readString(profile.name);
  const email = readString(profile.email);
  if (name !== undefined) {
    updates.name = name;
  }
  if (email !== undefined) {
    updates.email = email;
  }
  updates.image = resolveOAuthProfileImage(profile);
  return updates;
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      async profile(profile, tokens) {
        let image = profile.picture;
        const accessToken = readString(tokens.access_token);
        if (accessToken) {
          const googlePhoto = await fetchGooglePrimaryPhoto(accessToken);
          if (googlePhoto.url !== undefined) {
            image = googlePhoto.url;
          }
          if (googlePhoto.defaultFlag === true) {
            image = undefined;
          }
        }

        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image,
        };
      },
    }),
    Anonymous({
      profile: () => ({ isAnonymous: true }),
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const { existingUserId, type, profile } = args;

      // Keep OAuth profile fields fresh on every sign-in (including clearing default avatars).
      if (existingUserId) {
        if (type === "oauth") {
          const oauthProfileUpdates = getOAuthProfileUpdates(profile);
          await ctx.db.patch(existingUserId, {
            ...oauthProfileUpdates,
            emailVerificationTime: Date.now(),
          });
        }
        return existingUserId;
      }

      // Create new user (either anonymous or OAuth)
      const isAnonymous = type !== "oauth";

      // Build user fields with OAuth profile information if available
      const baseFields = {
        isAnonymous,
        ...initializeUserFields(),
      };

      const userFields =
        type === "oauth" && profile
          ? {
              ...baseFields,
              ...getOAuthProfileUpdates(profile),
              // OAuth providers have already verified the email
              emailVerificationTime: Date.now(),
            }
          : baseFields;

      const userId = await ctx.db.insert("users", userFields);

      // Initialize rate limits for new user
      await initializeRateLimits(ctx, userId, isAnonymous);

      return userId;
    },
  },
});
