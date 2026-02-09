export interface AvatarUserData {
  preferredName?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const SIZE_PARAM_REGEX = /sz=\d+/;
const S96_PARAM_REGEX = /s96-c/;

const normalizeSeedValue = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getUserAvatarSeed = (user: AvatarUserData | null | undefined): string => {
  const preferredName = normalizeSeedValue(user?.preferredName);
  if (preferredName) {
    return preferredName;
  }

  const name = normalizeSeedValue(user?.name);
  if (name) {
    return name;
  }

  const email = normalizeSeedValue(user?.email);
  if (email) {
    return email;
  }

  return "user";
};

export const getHighResolutionAvatarUrl = (
  imageUrl?: string | null,
  size = 192,
): string | undefined => {
  if (!imageUrl) {
    return;
  }

  if (imageUrl.includes("googleusercontent.com")) {
    if (imageUrl.includes("sz=")) {
      return imageUrl.replace(SIZE_PARAM_REGEX, `sz=${size}`);
    }

    if (imageUrl.includes("s96-c")) {
      return imageUrl.replace(S96_PARAM_REGEX, `s${size}-c`);
    }

    const separator = imageUrl.includes("?") ? "&" : "?";
    return `${imageUrl}${separator}sz=${size}`;
  }

  return imageUrl;
};
