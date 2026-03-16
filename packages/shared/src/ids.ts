// ---------------------------------------------------------------------------
// Branded newtype IDs (SPEC 2.1)
// ---------------------------------------------------------------------------
// Each ID is a string branded with a unique tag so that, for example, a
// RecipeId cannot be passed where a CreatorId is expected.
// ---------------------------------------------------------------------------

// -- UUID-based entity IDs --------------------------------------------------

export type CreatorId = string & { readonly __brand: "CreatorId" };
export type RecipeId = string & { readonly __brand: "RecipeId" };
export type CollectionId = string & { readonly __brand: "CollectionId" };
export type ProductId = string & { readonly __brand: "ProductId" };
export type BrandKitId = string & { readonly __brand: "BrandKitId" };
export type ImportJobId = string & { readonly __brand: "ImportJobId" };
export type PhotoId = string & { readonly __brand: "PhotoId" };
export type IngredientId = string & { readonly __brand: "IngredientId" };
export type InstructionId = string & { readonly __brand: "InstructionId" };
export type TeamMemberId = string & { readonly __brand: "TeamMemberId" };
export type EventId = string & { readonly __brand: "EventId" };

// -- Kit opaque identifiers -------------------------------------------------

export type KitAccountId = string & { readonly __brand: "KitAccountId" };
export type KitTagId = string & { readonly __brand: "KitTagId" };
export type KitFormId = string & { readonly __brand: "KitFormId" };
export type KitSequenceId = string & { readonly __brand: "KitSequenceId" };
export type KitBroadcastId = string & { readonly __brand: "KitBroadcastId" };
export type KitSubscriberId = string & { readonly __brand: "KitSubscriberId" };

// -- Validated string types -------------------------------------------------

export type Url = string & { readonly __brand: "Url" };
export type HexColor = string & { readonly __brand: "HexColor" };
export type Slug = string & { readonly __brand: "Slug" };

// ---------------------------------------------------------------------------
// Factory functions — UUID IDs
// ---------------------------------------------------------------------------

export function createCreatorId(id: string): CreatorId {
  return id as CreatorId;
}

export function createRecipeId(id: string): RecipeId {
  return id as RecipeId;
}

export function createCollectionId(id: string): CollectionId {
  return id as CollectionId;
}

export function createProductId(id: string): ProductId {
  return id as ProductId;
}

export function createBrandKitId(id: string): BrandKitId {
  return id as BrandKitId;
}

export function createImportJobId(id: string): ImportJobId {
  return id as ImportJobId;
}

export function createPhotoId(id: string): PhotoId {
  return id as PhotoId;
}

export function createIngredientId(id: string): IngredientId {
  return id as IngredientId;
}

export function createInstructionId(id: string): InstructionId {
  return id as InstructionId;
}

export function createTeamMemberId(id: string): TeamMemberId {
  return id as TeamMemberId;
}

export function createEventId(id: string): EventId {
  return id as EventId;
}

// ---------------------------------------------------------------------------
// Factory functions — Kit opaque identifiers
// ---------------------------------------------------------------------------

export function createKitAccountId(id: string): KitAccountId {
  return id as KitAccountId;
}

export function createKitTagId(id: string): KitTagId {
  return id as KitTagId;
}

export function createKitFormId(id: string): KitFormId {
  return id as KitFormId;
}

export function createKitSequenceId(id: string): KitSequenceId {
  return id as KitSequenceId;
}

export function createKitBroadcastId(id: string): KitBroadcastId {
  return id as KitBroadcastId;
}

export function createKitSubscriberId(id: string): KitSubscriberId {
  return id as KitSubscriberId;
}

// ---------------------------------------------------------------------------
// Validated string factory functions
// ---------------------------------------------------------------------------

const URL_REGEX = /^https?:\/\/.+/;

/**
 * Validate and create a Url branded type.
 * Returns null if the value is not a valid absolute URL.
 */
export function createUrl(value: string): Url | null {
  if (!URL_REGEX.test(value)) {
    return null;
  }
  try {
    new globalThis.URL(value);
    return value as Url;
  } catch {
    return null;
  }
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate and create a HexColor branded type.
 * Must be in #RRGGBB format. Returns null on invalid input.
 */
export function createHexColor(value: string): HexColor | null {
  if (!HEX_COLOR_REGEX.test(value)) {
    return null;
  }
  return value as HexColor;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate and create a Slug branded type.
 * Must be lowercase, URL-safe, hyphens only. Returns null on invalid input.
 */
export function createSlug(value: string): Slug | null {
  if (!SLUG_REGEX.test(value)) {
    return null;
  }
  return value as Slug;
}
