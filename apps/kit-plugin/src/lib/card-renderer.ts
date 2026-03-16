/**
 * Email-safe recipe card HTML renderer (SPEC §5.3).
 *
 * Renders recipe cards as HTML compatible with major email clients:
 * - iOS Mail, Gmail (web + app), Outlook (2019+, web), Apple Mail
 *
 * Constraints:
 * - All styles inline (no <style> blocks)
 * - No JavaScript in output
 * - Max width: 600px
 * - Images with explicit width and height attributes
 * - Table-based layout for email client compatibility
 */

import type { DietaryTag, HexColor } from "@dough/shared";
import type { BrandKit, CardRenderOptions, DisplayMode, PluginRecipe } from "@/lib/types";
import { DISPLAY_MODE } from "@/lib/types";
import { renderDietaryBadges } from "@/lib/dietary-icons";
import { renderSaveButton } from "@/lib/cta-generator";

// ---------------------------------------------------------------------------
// Quantity display helper
// ---------------------------------------------------------------------------

function formatQuantity(q: {
  readonly type: string;
  readonly value?: number;
  readonly numerator?: number;
  readonly denominator?: number;
  readonly whole?: number;
}): string {
  switch (q.type) {
    case "WholeNumber":
      return String(q.value ?? 0);
    case "Fraction":
      return `${q.numerator ?? 0}/${q.denominator ?? 1}`;
    case "Mixed":
      return `${q.whole ?? 0} ${q.numerator ?? 0}/${q.denominator ?? 1}`;
    case "Decimal":
      return String(q.value ?? 0);
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Font helpers
// ---------------------------------------------------------------------------

function buildFontStack(family: string, fallbacks: readonly string[]): string {
  const all = [family, ...fallbacks];
  return all.map((f) => (f.includes(" ") ? `'${f}'` : f)).join(", ");
}

function getHeadingFontStack(brand: BrandKit | null): string {
  if (brand === null) {
    return "Georgia, 'Times New Roman', serif";
  }
  return buildFontStack(
    brand.heading_font.family,
    brand.heading_font.fallback.length > 0 ? brand.heading_font.fallback : ["Georgia", "serif"],
  );
}

function getBodyFontStack(brand: BrandKit | null): string {
  if (brand === null) {
    return "Arial, Helvetica, sans-serif";
  }
  return buildFontStack(
    brand.body_font.family,
    brand.body_font.fallback.length > 0 ? brand.body_font.fallback : ["Arial", "sans-serif"],
  );
}

function getPrimaryColor(brand: BrandKit | null): HexColor {
  if (brand === null) {
    return "#2563EB" as HexColor;
  }
  return brand.primary_color;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderPhoto(recipe: PluginRecipe, maxHeight: number): string {
  const photo = recipe.photos.length > 0 ? recipe.photos[0] : null;
  if (photo === null || photo === undefined) {
    return "";
  }

  return [
    `<tr>`,
    `<td style="padding:0;">`,
    `<img src="${photo.url}" alt="${escapeHtml(photo.alt_text ?? recipe.title)}" `,
    `width="600" height="${Math.min(photo.height, maxHeight)}" `,
    `style="display:block;width:100%;max-height:${maxHeight}px;object-fit:cover;border:0;outline:none;" />`,
    `</td>`,
    `</tr>`,
  ].join("");
}

function renderTitle(
  recipe: PluginRecipe,
  headingFont: string,
  primaryColor: HexColor,
  fontSize: number,
): string {
  return [
    `<tr>`,
    `<td style="padding:16px 20px 8px 20px;">`,
    `<h1 style="`,
    `margin:0;`,
    `font-family:${headingFont};`,
    `font-size:${fontSize}px;`,
    `font-weight:bold;`,
    `color:${primaryColor};`,
    `line-height:1.3;`,
    `">${escapeHtml(recipe.title)}</h1>`,
    `</td>`,
    `</tr>`,
  ].join("");
}

function renderDescription(recipe: PluginRecipe, bodyFont: string, truncate: boolean): string {
  if (recipe.description === null) {
    return "";
  }

  const lineClampStyle = truncate
    ? "overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;"
    : "";

  return [
    `<tr>`,
    `<td style="padding:4px 20px 8px 20px;">`,
    `<p style="`,
    `margin:0;`,
    `font-family:${bodyFont};`,
    `font-size:14px;`,
    `color:#4B5563;`,
    `line-height:1.5;`,
    `${lineClampStyle}`,
    `">${escapeHtml(recipe.description)}</p>`,
    `</td>`,
    `</tr>`,
  ].join("");
}

function renderBadges(recipe: PluginRecipe, bodyFont: string, displayMode: DisplayMode): string {
  const parts: string[] = [];

  // Cook time badge
  if (recipe.timing.cook_minutes !== null) {
    parts.push(
      `<span style="display:inline-block;padding:4px 10px;margin:0 4px 4px 0;font-size:12px;font-family:${bodyFont};color:#374151;background-color:#F3F4F6;border-radius:4px;">` +
        `&#9201; ${recipe.timing.cook_minutes} min</span>`,
    );
  }

  // Servings badge
  if (recipe.yield !== null) {
    parts.push(
      `<span style="display:inline-block;padding:4px 10px;margin:0 4px 4px 0;font-size:12px;font-family:${bodyFont};color:#374151;background-color:#F3F4F6;border-radius:4px;">` +
        `&#127860; ${recipe.yield.quantity} ${escapeHtml(recipe.yield.unit)}</span>`,
    );
  }

  // Dietary icons (not in Compact mode)
  if (displayMode !== DISPLAY_MODE.Compact) {
    const dietaryTags = getDietaryTags(recipe);
    if (dietaryTags.size > 0) {
      parts.push(renderDietaryBadges(dietaryTags));
    }
  }

  if (parts.length === 0) {
    return "";
  }

  return [`<tr>`, `<td style="padding:4px 20px 8px 20px;">`, parts.join(""), `</td>`, `</tr>`].join(
    "",
  );
}

function renderIngredientsList(
  recipe: PluginRecipe,
  bodyFont: string,
  maxItems: number | null,
): string {
  // Flatten all ingredient groups
  const allIngredients: Array<{
    readonly groupLabel: string | null;
    readonly quantity: string;
    readonly unit: string | null;
    readonly item: string;
    readonly notes: string | null;
  }> = [];

  for (const group of recipe.ingredients) {
    for (const ingredient of group.ingredients) {
      allIngredients.push({
        groupLabel: group.label,
        quantity: ingredient.quantity !== null ? formatQuantity(ingredient.quantity) : "",
        unit: ingredient.unit,
        item: ingredient.item,
        notes: ingredient.notes,
      });
    }
  }

  if (allIngredients.length === 0) {
    return "";
  }

  const displayCount =
    maxItems !== null ? Math.min(maxItems, allIngredients.length) : allIngredients.length;
  const remaining = allIngredients.length - displayCount;
  const displayed = allIngredients.slice(0, displayCount);

  const rows = displayed
    .map((ing) => {
      const qtyPart = ing.quantity !== "" ? `${ing.quantity} ` : "";
      const unitPart = ing.unit !== null ? `${escapeHtml(ing.unit)} ` : "";
      const notesPart =
        ing.notes !== null ? ` <em style="color:#6B7280;">(${escapeHtml(ing.notes)})</em>` : "";
      return `<li style="margin:0 0 4px 0;padding:0;font-family:${bodyFont};font-size:14px;color:#374151;line-height:1.5;">${qtyPart}${unitPart}${escapeHtml(ing.item)}${notesPart}</li>`;
    })
    .join("");

  const moreText =
    remaining > 0
      ? `<li style="margin:0 0 4px 0;padding:0;font-family:${bodyFont};font-size:14px;color:#6B7280;font-style:italic;line-height:1.5;list-style:none;">+ ${remaining} more</li>`
      : "";

  return [
    `<tr>`,
    `<td style="padding:8px 20px;">`,
    `<h2 style="margin:0 0 8px 0;font-family:${bodyFont};font-size:16px;font-weight:bold;color:#1F2937;">Ingredients</h2>`,
    `<ul style="margin:0;padding:0 0 0 20px;">`,
    rows,
    moreText,
    `</ul>`,
    `</td>`,
    `</tr>`,
  ].join("");
}

function renderInstructions(recipe: PluginRecipe, bodyFont: string): string {
  const allInstructions: Array<{ readonly body: string }> = [];

  for (const group of recipe.instructions) {
    for (const instruction of group.instructions) {
      allInstructions.push({ body: instruction.body });
    }
  }

  if (allInstructions.length === 0) {
    return "";
  }

  const rows = allInstructions
    .map((inst, index) => {
      return `<li style="margin:0 0 8px 0;padding:0;font-family:${bodyFont};font-size:14px;color:#374151;line-height:1.5;" value="${index + 1}">${escapeHtml(inst.body)}</li>`;
    })
    .join("");

  return [
    `<tr>`,
    `<td style="padding:8px 20px;">`,
    `<h2 style="margin:0 0 8px 0;font-family:${bodyFont};font-size:16px;font-weight:bold;color:#1F2937;">Instructions</h2>`,
    `<ol style="margin:0;padding:0 0 0 24px;">`,
    rows,
    `</ol>`,
    `</td>`,
    `</tr>`,
  ].join("");
}

function renderNutritionSummary(recipe: PluginRecipe, bodyFont: string): string {
  if (recipe.nutrition === null) {
    return "";
  }

  const n = recipe.nutrition.per_serving;
  const items: string[] = [];

  if (n.calories !== null) {
    items.push(
      `<td style="padding:4px 8px;text-align:center;font-family:${bodyFont};font-size:13px;color:#374151;"><strong>${n.calories}</strong><br/>Calories</td>`,
    );
  }
  if (n.protein_g !== null) {
    items.push(
      `<td style="padding:4px 8px;text-align:center;font-family:${bodyFont};font-size:13px;color:#374151;"><strong>${n.protein_g}g</strong><br/>Protein</td>`,
    );
  }
  if (n.total_carbs_g !== null) {
    items.push(
      `<td style="padding:4px 8px;text-align:center;font-family:${bodyFont};font-size:13px;color:#374151;"><strong>${n.total_carbs_g}g</strong><br/>Carbs</td>`,
    );
  }
  if (n.total_fat_g !== null) {
    items.push(
      `<td style="padding:4px 8px;text-align:center;font-family:${bodyFont};font-size:13px;color:#374151;"><strong>${n.total_fat_g}g</strong><br/>Fat</td>`,
    );
  }

  if (items.length === 0) {
    return "";
  }

  return [
    `<tr>`,
    `<td style="padding:8px 20px;">`,
    `<h2 style="margin:0 0 8px 0;font-family:${bodyFont};font-size:16px;font-weight:bold;color:#1F2937;">Nutrition</h2>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#F9FAFB;border-radius:4px;">`,
    `<tr>`,
    items.join(""),
    `</tr>`,
    `</table>`,
    `</td>`,
    `</tr>`,
  ].join("");
}

function renderSaveButtonRow(
  recipe: PluginRecipe,
  options: CardRenderOptions,
  primaryColor: HexColor,
  bodyFont: string,
): string {
  const bodyFontFamily = bodyFont.split(",")[0]?.trim().replace(/'/g, "") ?? "Arial";

  return [
    `<tr>`,
    `<td style="padding:16px 20px 20px 20px;" align="center">`,
    renderSaveButton({
      appDomain: options.appDomain,
      creatorId: recipe.creator_id,
      recipeSlug: recipe.slug,
      primaryColor,
      bodyFont: bodyFontFamily,
    }),
    `</td>`,
    `</tr>`,
  ].join("");
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render a recipe card as email-safe HTML.
 *
 * @param recipe - The recipe data to render
 * @param options - Display mode, nutrition toggle, app domain
 * @param brand - Brand kit for styling (null for defaults)
 * @returns HTML string for the recipe card
 */
export function renderCard(
  recipe: PluginRecipe,
  options: CardRenderOptions,
  brand: BrandKit | null,
): string {
  const headingFont = getHeadingFontStack(brand);
  const bodyFont = getBodyFontStack(brand);
  const primaryColor = getPrimaryColor(brand);

  const sections: string[] = [];

  switch (options.displayMode) {
    case DISPLAY_MODE.Compact:
      sections.push(renderPhoto(recipe, 200));
      sections.push(renderTitle(recipe, headingFont, primaryColor, 22));
      sections.push(renderBadges(recipe, bodyFont, DISPLAY_MODE.Compact));
      sections.push(renderSaveButtonRow(recipe, options, primaryColor, bodyFont));
      break;

    case DISPLAY_MODE.Standard:
      sections.push(renderPhoto(recipe, 280));
      sections.push(renderTitle(recipe, headingFont, primaryColor, 22));
      sections.push(renderDescription(recipe, bodyFont, true));
      sections.push(renderBadges(recipe, bodyFont, DISPLAY_MODE.Standard));
      sections.push(renderIngredientsList(recipe, bodyFont, 8));
      sections.push(renderSaveButtonRow(recipe, options, primaryColor, bodyFont));
      break;

    case DISPLAY_MODE.Full:
      sections.push(renderPhoto(recipe, 320));
      sections.push(renderTitle(recipe, headingFont, primaryColor, 24));
      sections.push(renderDescription(recipe, bodyFont, false));
      sections.push(renderBadges(recipe, bodyFont, DISPLAY_MODE.Full));
      if (options.showNutrition) {
        sections.push(renderNutritionSummary(recipe, bodyFont));
      }
      sections.push(renderIngredientsList(recipe, bodyFont, null));
      sections.push(renderInstructions(recipe, bodyFont));
      sections.push(renderSaveButtonRow(recipe, options, primaryColor, bodyFont));
      break;
  }

  // Filter out empty sections
  const content = sections.filter((s) => s !== "").join("");

  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">`,
    content,
    `</table>`,
  ].join("");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDietaryTags(recipe: PluginRecipe): ReadonlySet<DietaryTag> {
  const dietary = recipe.classification.dietary;
  return dietary.tags;
}
