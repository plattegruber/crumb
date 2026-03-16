/**
 * Save This Recipe CTA URL generator (SPEC §5.4).
 *
 * Generates tracked URLs for the "Save This Recipe" button in email cards.
 * Kit replaces `{{subscriber.id}}` at send time with the subscriber's Kit ID.
 */

import type { CreatorId, HexColor, Slug } from "@dough/shared";

/**
 * Kit's subscriber variable syntax for subscriber ID.
 * Kit replaces this placeholder at send time.
 */
const KIT_SUBSCRIBER_PLACEHOLDER = "{{subscriber.id}}";

export interface SaveCtaOptions {
  readonly appDomain: string;
  readonly creatorId: CreatorId;
  readonly recipeSlug: Slug;
}

/**
 * Generate a tracked Save This Recipe URL per SPEC §5.4.
 *
 * Format: https://app.{domain}/save/{creator_id}/{recipe_slug}?ck={{subscriber.id}}
 *
 * The `{{subscriber.id}}` placeholder is Kit's subscriber variable syntax
 * and will be replaced with the actual subscriber ID at email send time.
 */
export function generateSaveUrl(options: SaveCtaOptions): string {
  const { appDomain, creatorId, recipeSlug } = options;
  return `https://app.${appDomain}/save/${creatorId}/${recipeSlug}?ck=${KIT_SUBSCRIBER_PLACEHOLDER}`;
}

export interface SaveButtonOptions {
  readonly appDomain: string;
  readonly creatorId: CreatorId;
  readonly recipeSlug: Slug;
  readonly primaryColor: HexColor;
  readonly bodyFont: string;
}

/**
 * Render the Save This Recipe button as email-safe HTML.
 * Uses table-based layout for maximum email client compatibility.
 */
export function renderSaveButton(options: SaveButtonOptions): string {
  const url = generateSaveUrl({
    appDomain: options.appDomain,
    creatorId: options.creatorId,
    recipeSlug: options.recipeSlug,
  });

  const fontFamily = `${options.bodyFont}, Arial, Helvetica, sans-serif`;

  // Table-based button for Outlook compatibility
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">`,
    `<tr>`,
    `<td align="center" style="`,
    `border-radius:6px;`,
    `background-color:${options.primaryColor};`,
    `">`,
    `<a href="${url}" target="_blank" style="`,
    `display:inline-block;`,
    `padding:14px 32px;`,
    `font-family:${fontFamily};`,
    `font-size:16px;`,
    `font-weight:bold;`,
    `color:#FFFFFF;`,
    `text-decoration:none;`,
    `border-radius:6px;`,
    `background-color:${options.primaryColor};`,
    `" title="Save This Recipe">Save This Recipe</a>`,
    `</td>`,
    `</tr>`,
    `</table>`,
  ].join("");
}
