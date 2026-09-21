export const SLUG_PATTERN = /^[a-z0-9-]{3,48}$/;

export const RESERVED_ORGANIZATION_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "catalog",
  "creator",
  "device",
  "docs",
  "games",
  "health",
  "login",
  "operator",
  "play",
  "signup",
  "www",
]);

export function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function validateProjectSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error("invalid slug");
  return slug;
}

export function validateOrganizationSlug(slug: string): string {
  validateProjectSlug(slug);
  if (RESERVED_ORGANIZATION_SLUGS.has(slug)) throw new Error("slug reserved");
  return slug;
}

export function playablePath(
  organizationSlug: string,
  projectSlug: string,
): string {
  return `/play/${organizationSlug}/${projectSlug}`;
}

export function allocateUniqueSlug(
  name: string,
  taken: (slug: string) => boolean,
): string {
  const base = normalizeSlug(name);
  const root =
    SLUG_PATTERN.test(base) && !RESERVED_ORGANIZATION_SLUGS.has(base)
      ? base
      : "studio";
  if (!taken(root)) return root;
  for (let n = 2; n < 1_000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, 48 - suffix.length)}${suffix}`;
    if (
      SLUG_PATTERN.test(candidate) &&
      !RESERVED_ORGANIZATION_SLUGS.has(candidate) &&
      !taken(candidate)
    ) {
      return candidate;
    }
  }
  throw new Error("slug already exists");
}
