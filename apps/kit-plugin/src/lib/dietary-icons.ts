/**
 * Dietary tag icons for email-safe rendering.
 *
 * Uses text-based labels with colored backgrounds since inline SVG
 * support is inconsistent across email clients (especially Outlook).
 * Each icon is rendered as a small pill/badge with abbreviation text.
 */

import type { DietaryTag } from "@crumb/shared";
import { DIETARY_TAG } from "@crumb/shared";

export interface DietaryIconConfig {
  readonly label: string;
  readonly abbreviation: string;
  readonly color: string;
}

const DIETARY_ICON_MAP: Readonly<Record<DietaryTag, DietaryIconConfig>> = {
  [DIETARY_TAG.GlutenFree]: {
    label: "Gluten-Free",
    abbreviation: "GF",
    color: "#D97706",
  },
  [DIETARY_TAG.DairyFree]: {
    label: "Dairy-Free",
    abbreviation: "DF",
    color: "#2563EB",
  },
  [DIETARY_TAG.Vegan]: {
    label: "Vegan",
    abbreviation: "VG",
    color: "#16A34A",
  },
  [DIETARY_TAG.Vegetarian]: {
    label: "Vegetarian",
    abbreviation: "V",
    color: "#059669",
  },
  [DIETARY_TAG.Keto]: {
    label: "Keto",
    abbreviation: "K",
    color: "#7C3AED",
  },
  [DIETARY_TAG.Paleo]: {
    label: "Paleo",
    abbreviation: "P",
    color: "#92400E",
  },
  [DIETARY_TAG.NutFree]: {
    label: "Nut-Free",
    abbreviation: "NF",
    color: "#DC2626",
  },
  [DIETARY_TAG.EggFree]: {
    label: "Egg-Free",
    abbreviation: "EF",
    color: "#EA580C",
  },
  [DIETARY_TAG.SoyFree]: {
    label: "Soy-Free",
    abbreviation: "SF",
    color: "#0891B2",
  },
};

/**
 * Get the icon configuration for a dietary tag.
 */
export function getDietaryIconConfig(tag: DietaryTag): DietaryIconConfig {
  return DIETARY_ICON_MAP[tag];
}

/**
 * Render a single dietary tag as an email-safe HTML badge.
 * Uses inline styles only — no external CSS.
 */
export function renderDietaryBadge(tag: DietaryTag): string {
  const config = DIETARY_ICON_MAP[tag];
  return [
    `<span style="`,
    `display:inline-block;`,
    `padding:2px 6px;`,
    `margin:0 2px;`,
    `font-size:11px;`,
    `font-family:Arial,Helvetica,sans-serif;`,
    `font-weight:bold;`,
    `color:#FFFFFF;`,
    `background-color:${config.color};`,
    `border-radius:3px;`,
    `line-height:16px;`,
    `" title="${config.label}">${config.abbreviation}</span>`,
  ].join("");
}

/**
 * Render a row of dietary badges for a set of tags.
 * Returns empty string if no tags are provided.
 */
export function renderDietaryBadges(tags: ReadonlySet<DietaryTag>): string {
  if (tags.size === 0) {
    return "";
  }

  const badges = Array.from(tags)
    .map((tag) => renderDietaryBadge(tag))
    .join("");

  return badges;
}
