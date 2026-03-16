/**
 * Slug generation utilities.
 *
 * Generates URL-safe, lowercase, hyphens-only slugs from recipe titles.
 */

/**
 * Generate a slug from a title string.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses multiple hyphens
 * - Trims leading/trailing hyphens
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Given a base slug and a set of existing slugs, return a unique slug.
 * If the base slug is not taken, returns it as-is.
 * Otherwise appends -2, -3, etc. until a unique one is found.
 */
export function resolveSlugConflict(
  baseSlug: string,
  existingSlugs: ReadonlySet<string>,
): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }
  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix++;
  }
  return `${baseSlug}-${suffix}`;
}
