// ---------------------------------------------------------------------------
// Enums — const objects with `as const` (SPEC §2.2–2.8+)
// ---------------------------------------------------------------------------
// TypeScript `enum` is intentionally avoided. Each enum is a plain const
// object and its value type is extracted with a mapped type.
// ---------------------------------------------------------------------------

// §2.4 Recipe
export const RECIPE_STATUS = {
  Draft: "Draft",
  Active: "Active",
  Archived: "Archived",
} as const;
export type RecipeStatus = (typeof RECIPE_STATUS)[keyof typeof RECIPE_STATUS];

// §2.8 DietaryTag
export const DIETARY_TAG = {
  GlutenFree: "GlutenFree",
  DairyFree: "DairyFree",
  Vegan: "Vegan",
  Vegetarian: "Vegetarian",
  Keto: "Keto",
  Paleo: "Paleo",
  NutFree: "NutFree",
  EggFree: "EggFree",
  SoyFree: "SoyFree",
} as const;
export type DietaryTag = (typeof DIETARY_TAG)[keyof typeof DIETARY_TAG];

// §2.8 MealType
export const MEAL_TYPE = {
  Breakfast: "Breakfast",
  Lunch: "Lunch",
  Dinner: "Dinner",
  Snack: "Snack",
  Dessert: "Dessert",
  Drink: "Drink",
  Condiment: "Condiment",
  Side: "Side",
} as const;
export type MealType = (typeof MEAL_TYPE)[keyof typeof MEAL_TYPE];

// §2.8 Season
export const SEASON = {
  Spring: "Spring",
  Summer: "Summer",
  Autumn: "Autumn",
  Winter: "Winter",
  Holiday: "Holiday",
} as const;
export type Season = (typeof SEASON)[keyof typeof SEASON];

// §2.2 SubscriptionTier
export const SUBSCRIPTION_TIER = {
  Free: "Free",
  Creator: "Creator",
  Pro: "Pro",
  Studio: "Studio",
} as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIER)[keyof typeof SUBSCRIPTION_TIER];

// §2.14 ProductStatus
export const PRODUCT_STATUS = {
  Draft: "Draft",
  Published: "Published",
  Archived: "Archived",
} as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

// §2.2 KitScope
export const KIT_SCOPE = {
  SubscribersRead: "SubscribersRead",
  SubscribersWrite: "SubscribersWrite",
  BroadcastsRead: "BroadcastsRead",
  BroadcastsWrite: "BroadcastsWrite",
  TagsRead: "TagsRead",
  TagsWrite: "TagsWrite",
  SequencesRead: "SequencesRead",
  FormsRead: "FormsRead",
  PurchasesWrite: "PurchasesWrite",
  WebhooksWrite: "WebhooksWrite",
} as const;
export type KitScope = (typeof KIT_SCOPE)[keyof typeof KIT_SCOPE];

// §2.2 WordPressRecipePlugin
export const WORDPRESS_RECIPE_PLUGIN = {
  WpRecipeMaker: "WpRecipeMaker",
  TastyRecipes: "TastyRecipes",
} as const;
export type WordPressRecipePlugin =
  (typeof WORDPRESS_RECIPE_PLUGIN)[keyof typeof WORDPRESS_RECIPE_PLUGIN];

// §2.9 NutritionSource
export const NUTRITION_SOURCE = {
  Calculated: "Calculated",
  ManuallyEntered: "ManuallyEntered",
} as const;
export type NutritionSource = (typeof NUTRITION_SOURCE)[keyof typeof NUTRITION_SOURCE];

// §2.18 KitSubscriberState
export const KIT_SUBSCRIBER_STATE = {
  Active: "Active",
  Inactive: "Inactive",
  Cancelled: "Cancelled",
  Bounced: "Bounced",
  Complained: "Complained",
} as const;
export type KitSubscriberState = (typeof KIT_SUBSCRIBER_STATE)[keyof typeof KIT_SUBSCRIBER_STATE];

// §2.19 TeamMemberRole
export const TEAM_MEMBER_ROLE = {
  Member: "Member",
} as const;
export type TeamMemberRole = (typeof TEAM_MEMBER_ROLE)[keyof typeof TEAM_MEMBER_ROLE];

// §2.14 EbookFormat
export const EBOOK_FORMAT = {
  LetterSize: "LetterSize",
  TradeSize: "TradeSize",
} as const;
export type EbookFormat = (typeof EBOOK_FORMAT)[keyof typeof EBOOK_FORMAT];

// §2.15 PublishPlatform
export const PUBLISH_PLATFORM = {
  StanStore: "StanStore",
  Gumroad: "Gumroad",
  LTK: "LTK",
} as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORM)[keyof typeof PUBLISH_PLATFORM];

// §2.16 EventSource
export const EVENT_SOURCE = {
  KitWebhook: "KitWebhook",
  KitApiPoll: "KitApiPoll",
  Internal: "Internal",
} as const;
export type EventSource = (typeof EVENT_SOURCE)[keyof typeof EVENT_SOURCE];

// ---------------------------------------------------------------------------
// Exhaustiveness helper
// ---------------------------------------------------------------------------

/**
 * Use in the `default` branch of a switch/if-else over a discriminated union
 * to get a compile-time error if a variant is missed.
 *
 * ```ts
 * function label(s: RecipeStatus): string {
 *   switch (s) {
 *     case RECIPE_STATUS.Draft: return "Draft";
 *     case RECIPE_STATUS.Active: return "Active";
 *     case RECIPE_STATUS.Archived: return "Archived";
 *     default: return assertExhaustive(s);
 *   }
 * }
 * ```
 */
export function assertExhaustive(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
