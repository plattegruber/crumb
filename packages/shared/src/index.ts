// ---------------------------------------------------------------------------
// @crumb/shared — barrel export
// ---------------------------------------------------------------------------

// Result type
export type { Result } from "./result.js";
export { ok, err, isOk, isErr } from "./result.js";

// Branded IDs and validated string types
export type {
  CreatorId,
  RecipeId,
  CollectionId,
  ProductId,
  BrandKitId,
  ImportJobId,
  PhotoId,
  IngredientId,
  InstructionId,
  TeamMemberId,
  EventId,
  KitAccountId,
  KitTagId,
  KitFormId,
  KitSequenceId,
  KitBroadcastId,
  KitSubscriberId,
  Url,
  HexColor,
  Slug,
} from "./ids.js";
export {
  createCreatorId,
  createRecipeId,
  createCollectionId,
  createProductId,
  createBrandKitId,
  createImportJobId,
  createPhotoId,
  createIngredientId,
  createInstructionId,
  createTeamMemberId,
  createEventId,
  createKitAccountId,
  createKitTagId,
  createKitFormId,
  createKitSequenceId,
  createKitBroadcastId,
  createKitSubscriberId,
  createUrl,
  createHexColor,
  createSlug,
} from "./ids.js";

// Enums
export type {
  RecipeStatus,
  DietaryTag,
  MealType,
  Season,
  SubscriptionTier,
  ProductStatus,
  KitScope,
  WordPressRecipePlugin,
  NutritionSource,
  KitSubscriberState,
  TeamMemberRole,
  EbookFormat,
  PublishPlatform,
  EventSource,
} from "./enums.js";
export {
  RECIPE_STATUS,
  DIETARY_TAG,
  MEAL_TYPE,
  SEASON,
  SUBSCRIPTION_TIER,
  PRODUCT_STATUS,
  KIT_SCOPE,
  WORDPRESS_RECIPE_PLUGIN,
  NUTRITION_SOURCE,
  KIT_SUBSCRIBER_STATE,
  TEAM_MEMBER_ROLE,
  EBOOK_FORMAT,
  PUBLISH_PLATFORM,
  EVENT_SOURCE,
  assertExhaustive,
} from "./enums.js";

// Quantity sum type and arithmetic
export type {
  Quantity,
  WholeNumber,
  Fraction,
  Mixed,
  Decimal,
} from "./quantity.js";
export {
  wholeNumber,
  fraction,
  mixed,
  decimal,
  gcd,
  multiply,
  add,
} from "./quantity.js";

// Value types
export type {
  KitConnection,
  WordPressConnection,
  Subscription,
  FontSpec,
  RecipeTiming,
  RecipeYield,
  IngredientGroup,
  Ingredient,
  InstructionGroup,
  Instruction,
  Photo,
  DietaryTagState,
  RecipeClassification,
} from "./value-types.js";

// Data models (§2.4, §2.9–2.19)
export type {
  // §2.4 RecipeSource + Recipe
  RecipeSource,
  Recipe,
  // §2.9 NutritionFacts
  NutritionValues,
  NutritionFacts,
  // §2.10 RecipeEngagementScore
  EngagementScoreInputs,
  RecipeEngagementScore,
  // §2.11 Collection
  Collection,
  // §2.12 ImportJob
  ImportSource,
  ImportError,
  ImportStatus,
  ImportJob,
  // §2.13 RecipeExtract
  RawIngredient,
  RawIngredientGroup,
  ExtractionConfidence,
  RecipeExtract,
  // §2.14 Product
  Chapter,
  EbookDetail,
  MealPlanDay,
  ShoppingItem,
  ShoppingSection,
  ShoppingList,
  MealPlanDetail,
  ProductBase,
  Product,
  // §2.15 PublishedListing
  PublishedListing,
  // §2.16 RecipeEngagementEvent
  EngagementEventType,
  RecipeEngagementEvent,
  // §2.17 SegmentProfile
  SegmentStat,
  SegmentProfile,
  // §2.18 KitSubscriberRecord
  KitSubscriberRecord,
  // §2.19 TeamMember
  TeamMember,
} from "./models.js";
