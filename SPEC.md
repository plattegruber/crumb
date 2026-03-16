# [PRODUCT] — Engineering Specification

**Version:** 1.0  
**Status:** Draft  
**Platform:** Web application + Kit App Store plugin

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Models](#2-data-models)
3. [System Components](#3-system-components)
4. [Kit Integration Layer](#4-kit-integration-layer)
5. [Recipe Card Plugin](#5-recipe-card-plugin)
6. [Recipe Library](#6-recipe-library)
7. [Import Pipeline](#7-import-pipeline)
8. [Digital Product Builder](#8-digital-product-builder)
9. [Segmentation Engine](#9-segmentation-engine)
10. [Automation Engine](#10-automation-engine)
11. [Analytics Engine](#11-analytics-engine)
12. [Publishing Pipeline](#12-publishing-pipeline)
13. [Authentication & Multi-tenancy](#13-authentication--multi-tenancy)
14. [Error Handling](#14-error-handling)
15. [Constraints & Non-Goals](#15-constraints--non-goals)

---

## 1. System Overview

[PRODUCT] is a web application that connects to a creator's Kit (formerly ConvertKit) account and adds food-native functionality: a structured recipe library, AI-powered recipe import, a Kit App Store editor plugin that renders recipe cards inside Kit's email composer, dietary preference segmentation, recipe-triggered automations, digital product generation (ebooks, meal plans, recipe card packs), and analytics that surface which recipe content drives subscriber engagement and revenue.

The system is a vertical layer on top of Kit's infrastructure. It does not deliver emails, manage sequences, or process payments. Kit owns those primitives. [PRODUCT] owns the recipe intelligence that makes Kit useful for food creators.

The system consists of:
- A **web application** (the main creator dashboard)
- A **Kit App Store plugin** (injected into Kit's email editor)
- An **import pipeline** (AI-powered recipe extraction from URLs, social media, video, and images)
- A **segmentation engine** (dietary preference tagging synchronized to Kit tags and custom fields)
- An **automation engine** (Kit sequence and broadcast orchestration triggered by recipe behavior)
- A **product builder** (PDF/EPUB generation from recipe library subsets)
- An **analytics engine** (recipe engagement scoring derived from Kit webhook data)

---

## 2. Data Models

### 2.0 Notation

This section uses a language-agnostic type notation. Any typed language (TypeScript, Rust, Haskell, Elm, F#, Swift, Kotlin, Go with sum-type libraries, etc.) can implement these directly. Implementations should treat this notation as the canonical shape — the names, field presence rules, and variant structure are normative.

```
TypeName = BaseType              -- newtype alias: distinct type, same representation
Record { field: Type }           -- product type / struct / record
A | B | C(payload)               -- sum type / discriminated union / tagged union
Option<T>                        -- value is present or absent; no null permitted
List<T>                          -- ordered, immutable sequence
Set<T>                           -- unordered, deduplicated collection
Map<K, V>                        -- key-value association
Derived                          -- field is computed, not stored as source-of-truth
```

Entities have identity and change over time. Values are defined by their content and are immutable. Where a type is a value with no meaningful identity beyond its contents, it is marked as a value type.

---

### 2.1 Primitive Aliases

All IDs are newtypes. They share the same underlying representation (UUID) but are distinct types. A function accepting a `RecipeId` must not accept a `CreatorId`, even though both are UUIDs.

```
CreatorId     = UUID
RecipeId      = UUID
CollectionId  = UUID
ProductId     = UUID
BrandKitId    = UUID
ImportJobId   = UUID
PhotoId       = UUID
IngredientId  = UUID
InstructionId = UUID
TeamMemberId  = UUID
EventId       = UUID

Url           = string  -- validated as a well-formed absolute URL
HexColor      = string  -- validated as #RRGGBB
Slug          = string  -- lowercase, URL-safe, hyphens only; e.g. "lemon-pasta"
KitAccountId  = string  -- Kit's opaque account identifier
KitTagId      = string  -- Kit's opaque tag identifier
KitFormId     = string
KitSequenceId = string
KitBroadcastId = string
KitSubscriberId = string
```

---

### 2.2 Creator

```
Creator {
  id:                  CreatorId
  email:               string
  name:                string
  password_hash:       string                -- bcrypt, cost 12
  email_verified_at:   Option<timestamp>
  kit_connection:      Option<KitConnection>
  subscription:        Subscription
  brand_kit_ids:       List<BrandKitId>      -- first element is the default
  wordpress_connection: Option<WordPressConnection>
  created_at:          timestamp
  updated_at:          timestamp
}
```

```
KitConnection {                              -- value type
  account_id:       KitAccountId
  access_token:     string                  -- encrypted at rest
  refresh_token:    string                  -- encrypted at rest
  expires_at:       timestamp
  scopes:           Set<KitScope>
  connected_at:     timestamp
}

KitScope =
  | SubscribersRead
  | SubscribersWrite
  | BroadcastsRead
  | BroadcastsWrite
  | TagsRead
  | TagsWrite
  | SequencesRead
  | FormsRead
  | PurchasesWrite
  | WebhooksWrite
```

```
WordPressConnection {                        -- value type
  site_url:     Url
  api_key:      string                      -- encrypted at rest; WP Application Password
  plugin:       WordPressRecipePlugin
  connected_at: timestamp
}

WordPressRecipePlugin = WpRecipeMaker | TastyRecipes
```

```
Subscription {                              -- value type
  tier:        SubscriptionTier
  started_at:  timestamp
  renews_at:   Option<timestamp>
}

SubscriptionTier = Free | Creator | Pro | Studio
```

---

### 2.3 BrandKit

```
BrandKit {
  id:              BrandKitId
  creator_id:      CreatorId
  name:            string
  logo_url:        Option<Url>
  primary_color:   HexColor
  secondary_color: Option<HexColor>
  accent_color:    Option<HexColor>
  heading_font:    FontSpec
  body_font:       FontSpec
  created_at:      timestamp
  updated_at:      timestamp
}
```

```
FontSpec {                                   -- value type
  family:   string                          -- Google Fonts name or system font
  fallback: List<string>                    -- e.g. ["Georgia", "serif"]
}
```

---

### 2.4 Recipe

The Recipe is the central entity. It represents a single, creator-authored recipe. It is never generated by AI — AI assists with import and formatting only.

```
Recipe {
  id:            RecipeId
  creator_id:    CreatorId
  title:         string
  slug:          Slug                       -- unique per creator
  description:   Option<string>
  source:        RecipeSource              -- replaces source_type + source_url fields
  status:        RecipeStatus
  email_ready:   boolean

  timing:        RecipeTiming
  yield:         Option<RecipeYield>

  ingredients:   List<IngredientGroup>
  instructions:  List<InstructionGroup>
  notes:         Option<string>

  photos:        List<Photo>               -- first photo is primary

  classification: RecipeClassification
  nutrition:     Option<NutritionFacts>

  collection_ids: Set<CollectionId>

  created_at:    timestamp
  updated_at:    timestamp
}
```

```
RecipeStatus = Draft | Active | Archived
```

```
RecipeSource =                              -- value type, discriminated union
  | Manual
  | ImportedFromUrl(url: Url)
  | ImportedFromInstagram(post_url: Url)
  | ImportedFromTikTok(video_url: Url)
  | ImportedFromYoutube(video_url: Url)
  | ImportedFromScreenshot(upload_id: string)
  | SyncedFromWordPress {
      site_url:            Url
      wordpress_recipe_id: string
      last_synced_at:      timestamp
    }
```

`RecipeSource` replaces the previous `source_type: enum`, `source_url: Option<string>`, and `wordpress_recipe_id: Option<string>` fields. Each variant carries exactly the data its source requires and no more.

```
RecipeTiming {                              -- value type
  prep_minutes:  Option<integer>
  cook_minutes:  Option<integer>
  total_minutes: Option<integer>           -- if null, display sum of prep + cook
}
```

```
RecipeYield {                               -- value type
  quantity: integer
  unit:     string                         -- "servings", "cookies", "cups"
}
```

---

### 2.5 Ingredient

Ingredients are grouped to support recipes with distinct component sections (e.g. "For the sauce", "For the dough"). A recipe with no sections has a single group with no label.

```
IngredientGroup {                           -- value type
  label:       Option<string>              -- e.g. "For the sauce"
  ingredients: List<Ingredient>
}
```

```
Ingredient {
  id:       IngredientId
  quantity: Option<Quantity>
  unit:     Option<string>                 -- "cup", "g", "tbsp"
  item:     string                         -- "all-purpose flour"
  notes:    Option<string>                 -- "sifted", "room temperature"
}
```

```
Quantity =                                  -- value type
  | WholeNumber(integer)
  | Fraction { numerator: integer, denominator: integer }
  | Mixed { whole: integer, numerator: integer, denominator: integer }
  | Decimal(float)                         -- for quantities where fractions are unnatural
                                           -- e.g. 0.5g of a spice in a lab-precision recipe
```

`Fraction` and `Mixed` represent values exactly. `Decimal` is available but its use should be minimized. `WholeNumber(3)`, `Fraction(1, 3)`, `Mixed(1, 1, 2)` are the common cases. Implementations must not silently coerce `Fraction(1, 3)` to `Decimal(0.333)`.

**Scaling rule:** Given a scale factor `s = target_servings / original_servings`, each `Quantity` is multiplied by `s` using rational arithmetic. The result is simplified to lowest terms and rounded to the nearest canonical fraction (1/4, 1/3, 1/2, 2/3, 3/4) if within 2% of that value; otherwise returned as `Decimal`.

---

### 2.6 Instruction

```
InstructionGroup {                          -- value type
  label:        Option<string>
  instructions: List<Instruction>
}
```

```
Instruction {
  id:   InstructionId
  body: string
}
```

---

### 2.7 Photo

```
Photo {
  id:       PhotoId
  url:      Url                            -- CDN URL after upload
  alt_text: Option<string>
  width:    integer                        -- pixels
  height:   integer                        -- pixels
}
```

Photos are ordered by their position in `Recipe.photos`. The first photo is the primary photo used in recipe cards, product covers, and ebook layouts.

---

### 2.8 DietaryTag

`DietaryTag` is a closed enum. It is not a stringly-typed struct with a label field — display labels are a UI concern and do not belong in the data model.

```
DietaryTag =
  | GlutenFree
  | DairyFree
  | Vegan
  | Vegetarian
  | Keto
  | Paleo
  | NutFree
  | EggFree
  | SoyFree
```

Dietary tags on a `Recipe` carry their confirmation state as part of the type:

```
DietaryTagState =                           -- value type
  | Unconfirmed(tags: Set<DietaryTag>)     -- AI-inferred, awaiting creator review
  | Confirmed(tags: Set<DietaryTag>)       -- creator has reviewed and approved
```

A recipe with `Unconfirmed` tags may not propagate those tags to Kit subscribers. Only `Confirmed` tags are used by the Segmentation Engine.

`Recipe.classification` carries the dietary tag state:

```
RecipeClassification {                      -- value type
  dietary:    DietaryTagState
  cuisine:    Option<string>
  meal_types: Set<MealType>
  seasons:    Set<Season>
}

MealType = Breakfast | Lunch | Dinner | Snack | Dessert | Drink | Condiment | Side

Season = Spring | Summer | Autumn | Winter | Holiday
```

---

### 2.9 NutritionFacts

```
NutritionFacts {                            -- value type
  source:           NutritionSource
  per_serving:      NutritionValues
}

NutritionSource =
  | Calculated                             -- derived from USDA ingredient matching
  | ManuallyEntered                        -- creator entered directly

NutritionValues {
  calories:          Option<integer>
  total_fat_g:       Option<float>
  saturated_fat_g:   Option<float>
  cholesterol_mg:    Option<float>
  sodium_mg:         Option<float>
  total_carbs_g:     Option<float>
  dietary_fiber_g:   Option<float>
  total_sugars_g:    Option<float>
  protein_g:         Option<float>
  vitamin_d_mcg:     Option<float>
  calcium_mg:        Option<float>
  iron_mg:           Option<float>
  potassium_mg:      Option<float>
}
```

`NutritionSource` is embedded in `NutritionFacts` rather than carried as a parallel field on `Recipe`. A nutrition value and its provenance travel together.

---

### 2.10 RecipeEngagementScore

Engagement score is computed, not authored. It does not live on `Recipe`. It lives in its own derived record, keyed by recipe, and updated by the Analytics Engine on a schedule.

```
RecipeEngagementScore {
  recipe_id:    RecipeId
  creator_id:   CreatorId
  score:        float                      -- 0.0–10.0
  computed_at:  timestamp
  inputs:       EngagementScoreInputs
}

EngagementScoreInputs {                    -- value type; stored for auditability
  save_clicks_30d:            integer
  sequence_triggers_30d:      integer
  card_views_30d:             integer
  purchase_attributions_all:  integer
}
```

Querying a recipe's score is a join or lookup against `RecipeEngagementScore`, not a field on the recipe itself. If no score record exists, the score is absent — not zero.

---

### 2.11 Collection

```
Collection {
  id:          CollectionId
  creator_id:  CreatorId
  name:        string
  description: Option<string>
  recipe_ids:  List<RecipeId>             -- ordered; order determines product generation order
  created_at:  timestamp
  updated_at:  timestamp
}
```

A recipe can belong to zero or more collections. `Collection.recipe_ids` is the authoritative order. The inverse relationship (which collections contain a recipe) is derived.

---

### 2.12 ImportJob

`ImportJob` status is a sum type that carries its associated data per state. You cannot access an extracted recipe on a failed job. You cannot access an error on a pending job.

```
ImportJob {
  id:         ImportJobId
  creator_id: CreatorId
  status:     ImportStatus
  created_at: timestamp
  updated_at: timestamp
}

ImportStatus =
  | Pending(source: ImportSource)
  | Processing(source: ImportSource, started_at: timestamp)
  | NeedsReview(source: ImportSource, extract: RecipeExtract)
  | Completed(source: ImportSource, recipe_id: RecipeId)
  | Failed(source: ImportSource, error: ImportError)
```

```
ImportSource =                              -- value type, mirrors RecipeSource variants
  | FromUrl(url: Url)
  | FromInstagramPost(url: Url)
  | FromTikTokVideo(url: Url)
  | FromYouTubeVideo(url: Url)
  | FromScreenshot(upload_id: string)
  | FromInstagramBulk(account_handle: string)
  | FromWordPressSync(site_url: Url)
```

```
ImportError =                               -- value type
  | FetchFailed(reason: string)
  | ExtractionFailed(reason: string)
  | VideoTooLong(duration_seconds: integer)
  | FileTooLarge(size_bytes: integer)
  | WordPressAuthFailed
  | Timeout
```

---

### 2.13 RecipeExtract

Intermediate value produced by the AI extraction pipeline. Exists only inside an `ImportStatus.NeedsReview` variant. Not independently persisted.

```
RecipeExtract {                             -- value type
  title:        Option<string>
  description:  Option<string>
  ingredients:  List<RawIngredientGroup>
  instructions: List<string>
  timing:       RecipeTiming
  yield:        Option<RecipeYield>
  notes:        Option<string>
  photo_urls:   List<Url>
  dietary_tags: Set<DietaryTag>            -- AI-inferred, becomes Unconfirmed on promotion
  confidence:   ExtractionConfidence
}

RawIngredientGroup {                        -- value type
  label:       Option<string>
  ingredients: List<RawIngredient>
}

RawIngredient {                             -- value type
  raw_text:   string                       -- original extracted string, preserved verbatim
  quantity:   Option<Quantity>
  unit:       Option<string>
  item:       Option<string>
  notes:      Option<string>
  confidence: float                        -- 0.0–1.0
}

ExtractionConfidence {                      -- value type
  overall:      float                      -- 0.0–1.0
  field_scores: Map<string, float>         -- per-field; keys match RecipeExtract field names
}
```

---

### 2.14 Product

Product uses a shared base record with type-specific extension records. There are no nullable fields that are meaningful for only some product types.

```
ProductBase {
  id:                    ProductId
  creator_id:            CreatorId
  status:                ProductStatus
  title:                 string
  description:           Option<string>
  brand_kit_id:          BrandKitId
  template_id:           string
  pdf_url:               Option<Url>
  epub_url:              Option<Url>
  published_to:          List<PublishedListing>
  kit_form_id:           Option<KitFormId>
  kit_sequence_id:       Option<KitSequenceId>
  suggested_price_cents: Option<integer>
  currency:              string                  -- ISO 4217, default "USD"
  ai_copy_reviewed:      boolean
  created_at:            timestamp
  updated_at:            timestamp
}

ProductStatus = Draft | Published | Archived
```

```
Product =
  | Ebook(base: ProductBase, detail: EbookDetail)
  | MealPlan(base: ProductBase, detail: MealPlanDetail)
  | RecipeCardPack(base: ProductBase, recipe_ids: List<RecipeId>)
  | LeadMagnet(base: ProductBase, parent_product_id: ProductId, recipe_ids: List<RecipeId>)
```

```
EbookDetail {                               -- value type
  recipe_ids: List<RecipeId>               -- flat ordered list; chapters reference into this
  chapters:   List<Chapter>
  intro_copy: Option<string>
  author_bio: Option<string>
  format:     EbookFormat
}

EbookFormat = LetterSize | TradeSize        -- 8.5×11 or 6×9
```

```
Chapter {                                   -- value type
  title:      string
  intro_copy: Option<string>
  recipe_ids: List<RecipeId>               -- ordered subset of EbookDetail.recipe_ids
}
```

```
MealPlanDetail {                            -- value type
  days:          List<MealPlanDay>
  shopping_list: Option<ShoppingList>      -- generated; null until creator confirms the plan
}

MealPlanDay {                               -- value type
  day_number:       integer                -- 1-based
  breakfast:        Option<RecipeId>
  lunch:            Option<RecipeId>
  dinner:           Option<RecipeId>
  snacks:           List<RecipeId>
}
```

```
ShoppingList {                              -- value type, derived from MealPlanDetail
  sections: List<ShoppingSection>
  generated_at: timestamp
}

ShoppingSection {
  label: string                            -- "Produce", "Dairy", "Meat", "Pantry", etc.
  items: List<ShoppingItem>
}

ShoppingItem {
  quantity:    Option<Quantity>
  unit:        Option<string>
  item:        string
  recipe_refs: List<RecipeId>             -- which recipes need this item
}
```

---

### 2.15 PublishedListing

```
PublishedListing {                          -- value type
  platform:     PublishPlatform
  listing_url:  Option<Url>               -- present when platform returns it; may arrive async
  platform_id:  Option<string>            -- platform's own product identifier
  published_at: timestamp
}

PublishPlatform = StanStore | Gumroad | LTK
```

`listing_url` is `Option` because some platforms return the URL asynchronously or require the creator to confirm it. The listing record exists from the moment publishing begins; the URL is populated when confirmed.

---

### 2.16 RecipeEngagementEvent

```
RecipeEngagementEvent {
  id:                EventId
  creator_id:        CreatorId
  recipe_id:         RecipeId
  event:             EngagementEventType
  kit_subscriber_id: Option<KitSubscriberId>
  source:            EventSource
  occurred_at:       timestamp
}

EngagementEventType =
  | SaveClick
  | CardView
  | SequenceTrigger
  | PurchaseAttribution(product_id: ProductId)  -- ProductId carried only here, not on base
```

`EngagementEventType.PurchaseAttribution` carries the `ProductId` because it is the only variant for which a product is meaningful. Other variants do not carry a nullable product field.

```
EventSource = KitWebhook | KitApiPoll | Internal
```

---

### 2.17 SegmentProfile

Derived by the Analytics Engine. Not authored by the creator. Represents the dietary preference distribution of a creator's Kit subscriber list at a point in time.

```
SegmentProfile {
  creator_id:  CreatorId
  computed_at: timestamp
  segments:    Map<DietaryTag, SegmentStat>
}

SegmentStat {                               -- value type
  subscriber_count: integer
  engagement_rate:  float                  -- fraction with ≥1 save_click in last 30 days
  growth_rate_30d:  float                  -- % change in subscriber_count over 30 days
  top_recipe_ids:   List<RecipeId>         -- up to 3, by save_click count in this segment
}
```

---

### 2.18 KitSubscriberRecord

Ephemeral. Derived from Kit API responses. Never persisted by [PRODUCT]. Cached short-term only.

```
KitSubscriberRecord {                       -- value type, not persisted
  id:            KitSubscriberId
  email:         string
  first_name:    Option<string>
  tags:          Set<string>
  custom_fields: Map<string, string>
  state:         KitSubscriberState
}

KitSubscriberState = Active | Inactive | Cancelled | Bounced | Complained
```

---

### 2.19 TeamMember

Studio tier only.

```
TeamMember {
  id:         TeamMemberId
  creator_id: CreatorId                   -- the account they have access to
  email:      string
  role:       TeamMemberRole
  invited_at: timestamp
  accepted_at: Option<timestamp>
}

TeamMemberRole = Member                   -- single role in v1; extended in future tiers
```

---

### 2.20 Data Model Invariants

The following invariants must be enforced at the application layer. They are normative.

1. A `Recipe` with `source: SyncedFromWordPress` must have a `wordpress_recipe_id` that is unique per creator.
2. `Collection.recipe_ids` must not contain duplicates. All referenced `RecipeId`s must belong to the same `CreatorId`.
3. A `Product` in `Published` status must have a non-null `pdf_url`. Publishing must be blocked until rendering completes.
4. A `LeadMagnet` product's `parent_product_id` must reference a product owned by the same `CreatorId`. A `LeadMagnet` may not reference another `LeadMagnet`.
5. `ai_copy_reviewed` on `ProductBase` must be `true` before the product may transition to `Published` status.
6. `DietaryTagState.Confirmed` tags are the only tags propagated to Kit. The application layer must check `DietaryTagState` variant before any Kit tag write.
7. `RecipeEngagementEvent` records are append-only. They are never updated or deleted.
8. `SegmentProfile` records are replaced entirely on each computation — previous profiles for the same `creator_id` are superseded, not merged.
9. `Quantity.Fraction` and `Quantity.Mixed` must have `denominator ≠ 0` and must be in lowest terms (GCD of numerator and denominator is 1).
10. `SubscriptionTier.Free` creators are limited to 25 active `Recipe` records, 1 `Published` product, and 3 recipe card email sends per calendar month. These limits are enforced by the application layer, not the schema.
## 3. System Components

### 3.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Application                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Library  │  │ Product  │  │Segment-  │  │  Analytics   │   │
│  │  Module   │  │ Builder  │  │ation UI  │  │  Dashboard   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │                │           │
│  ┌────▼──────────────▼──────────────▼────────────────▼──────┐   │
│  │                    Application Core                        │   │
│  │  Recipe Library  │  Product Builder  │  Automation Engine │   │
│  │  Import Pipeline │  Analytics Engine │  Publishing        │   │
│  └────────────────────────────┬──────────────────────────────┘   │
│                               │                                   │
└───────────────────────────────┼───────────────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Kit Integration     │
                    │      Layer            │
                    │  V4 API │  Webhooks   │
                    └───────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │     Kit Platform       │
                    │  (email, subscribers,  │
                    │   sequences, forms)    │
                    └───────────────────────┘

Kit App Store Plugin (runs inside Kit's email editor — separate JS bundle):
  ┌─────────────────────────────────────┐
  │  Recipe Card Plugin                  │
  │  ├── Library search UI              │
  │  ├── Card renderer                  │
  │  └── [PRODUCT] API client           │
  └─────────────────────────────────────┘
```

### 3.2 Component Responsibilities

**Recipe Library** — owns all Recipe, Collection, Ingredient, Instruction, Photo, and NutritionFacts CRUD. Enforces data integrity. Triggers dietary auto-tagging on create/update.

**Import Pipeline** — accepts import requests, coordinates with AI extraction services, manages ImportJob lifecycle, presents RecipeExtract for creator review, and promotes confirmed extracts to Recipe records.

**Product Builder** — assembles Product records from Recipe subsets, invokes AI for chapter organization and copy generation, renders PDF and EPUB using template engine, manages file storage, and triggers lead magnet generation.

**Segmentation Engine** — maintains dietary preference state. Listens to Kit webhooks and recipe engagement events. Writes tags and custom fields back to Kit subscribers via Kit API.

**Automation Engine** — manages Kit sequence and broadcast draft creation on behalf of the creator. Responds to recipe email-ready flags, Save This Recipe click events, and scheduled seasonal triggers.

**Analytics Engine** — ingests RecipeEngagementEvents from Kit webhooks and polling, computes per-recipe engagement scores, computes SegmentProfiles, and surfaces product recommendations.

**Kit Integration Layer** — wraps Kit V4 API. Manages OAuth token lifecycle. Provides typed methods for all Kit API operations used by other components. Handles rate limiting and retry.

**Publishing Pipeline** — packages finished Product files and uploads to external platforms (Stan Store, Gumroad, LTK) via their APIs. Stores PublishedListing records.

**Recipe Card Plugin** — Kit App Store editor plugin. A standalone JavaScript bundle served by [PRODUCT] and installed into Kit's email editor via the App Store. Communicates with [PRODUCT]'s API to browse the recipe library and render card blocks.

---

## 4. Kit Integration Layer

### 4.1 OAuth 2.0 Flow

Kit uses standard OAuth 2.0 authorization code flow for App Store apps.

**Scopes required:**
- `subscribers:read`
- `subscribers:write`
- `broadcasts:read`
- `broadcasts:write`
- `tags:read`
- `tags:write`
- `sequences:read`
- `forms:read`
- `purchases:write`
- `webhooks:write`

**Token storage:** Access and refresh tokens are encrypted at rest using AES-256-GCM with a per-creator key derivation. Tokens are never returned to the client.

**Token refresh:** The Kit Integration Layer automatically refreshes tokens before expiry (threshold: 5 minutes before `expires_at`). All outbound Kit API calls pass through a token middleware that ensures a valid token is present.

**Revocation handling:** If Kit returns `401` on a token refresh attempt, the creator's Kit connection is marked `disconnected` and the creator is notified on next login. No Kit API calls are made while disconnected.

### 4.2 API Client

Base URL: `https://api.kit.com/v4`

Rate limit: 120 requests per 60-second rolling window per Kit account. The client tracks request timestamps and queues requests when approaching the limit. Requests that would exceed the limit are queued with exponential backoff starting at 500ms, max 10 retries before failing.

**Methods exposed by the Kit Integration Layer:**

```
// Subscribers
getSubscriber(email: string): KitSubscriberRecord
createSubscriber(email: string, first_name?: string, fields?: map): KitSubscriberRecord
updateSubscriber(id: string, fields: map): KitSubscriberRecord
tagSubscriber(subscriber_id: string, tag_name: string): void
untagSubscriber(subscriber_id: string, tag_name: string): void

// Tags
listTags(): KitTag[]
createTag(name: string): KitTag
getOrCreateTag(name: string): KitTag    // idempotent — returns existing if found

// Custom Fields
listCustomFields(): KitCustomField[]
createCustomField(key: string, label: string): KitCustomField
getOrCreateCustomField(key: string, label: string): KitCustomField  // idempotent

// Broadcasts
createBroadcastDraft(params: BroadcastDraftParams): KitBroadcast
getBroadcast(id: string): KitBroadcast

// Sequences
listSequences(): KitSequence[]
addSubscriberToSequence(subscriber_id: string, sequence_id: string): void

// Forms
listForms(): KitForm[]
createForm(params: KitFormParams): KitForm

// Purchases
createPurchase(params: KitPurchaseParams): void

// Webhooks
registerWebhook(event: string, target_url: string): KitWebhook
listWebhooks(): KitWebhook[]
deleteWebhook(id: string): void
```

**BroadcastDraftParams:**
```
{
  subject:        string
  content:        string    // HTML — recipe card block is embedded here
  description:    string    // internal label
  email_layout_template: string | null
  subscriber_filter: { tags: string[] } | null
  send_at:        timestamp | null
}
```

### 4.3 Webhooks

On creator account creation, [PRODUCT] registers webhooks for the following Kit events via Kit's webhook API:

| Kit Event | Handler |
|-----------|---------|
| `subscriber.activated` | Segmentation Engine: apply dietary preference from custom fields |
| `subscriber.tag_added` | Analytics Engine: record tag as engagement event |
| `subscriber.unsubscribed` | Segmentation Engine: remove from segment counts |
| `purchase.completed` | Analytics Engine: record purchase attribution event |
| `link.clicked` | Analytics Engine: if link is a Save This Recipe CTA, record save event |

Webhook payloads are verified using HMAC-SHA256 with the Kit webhook secret. Unverified payloads are rejected with `403`. Verified payloads are acknowledged with `200` immediately and processed asynchronously via a job queue.

**Webhook retry:** If [PRODUCT]'s webhook endpoint returns non-`2xx`, Kit retries with exponential backoff. [PRODUCT] must be idempotent on duplicate webhook delivery — all webhook handlers check for existing processed records before acting.

### 4.4 Kit Tag Naming Convention

All Kit tags created by [PRODUCT] use a namespaced format to avoid collision with creator-managed tags:

```
dietary:{tag_slug}                    // e.g. "dietary:gluten-free"
recipe:saved:{recipe_slug}           // e.g. "recipe:saved:lemon-pasta"
product:purchased:{product_id_short} // e.g. "product:purchased:a1b2c3"
```

Tags are created lazily (on first use) via `getOrCreateTag`.

### 4.5 Kit Custom Field Convention

```
preferred_dietary_tags    // comma-separated list from preference capture form
last_recipe_saved         // recipe slug
last_recipe_saved_at      // ISO timestamp
```

Custom fields are created lazily via `getOrCreateCustomField`.

---

## 5. Recipe Card Plugin

The Recipe Card Plugin is a Kit App Store plugin — a JavaScript bundle that Kit loads inside its email editor, granting it the ability to add a custom content block type.

### 5.1 Plugin Registration

The plugin is registered in the Kit App Store with:
- Block name: "Recipe Card"
- Block icon: fork-and-knife SVG
- Callback URL: `https://app.[product-domain].com/plugin/kit/recipe-card`
- Authentication: OAuth (same token as the main app — plugin shares the creator's session)

### 5.2 Plugin UI States

**State: No library**  
Creator has no recipes. Renders a prompt: "Add your first recipe to [PRODUCT] to insert recipe cards." Links to [PRODUCT] library.

**State: Library search**  
Default state when block is inserted. Renders a search input and scrollable recipe list showing title, primary photo thumbnail, and cook time. Filters update in real time. Selecting a recipe transitions to Preview.

**State: Preview**  
Shows a full render of the recipe card as it will appear in email. Creator can toggle display mode (Compact / Standard / Full), toggle nutrition display, and confirm insertion.

**State: Inserted**  
Block is in the email. Creator can click to reopen and swap the recipe or change display mode.

### 5.3 Card Rendering

The plugin renders recipe cards as HTML/CSS compatible with email clients. Constraints:
- No external CSS frameworks
- All styles inline (`style` attributes)
- No JavaScript in rendered output (email clients do not execute JS)
- Max width: 600px
- Images served from [PRODUCT]'s CDN with explicit `width` and `height` attributes
- Tested rendering targets: iOS Mail, Gmail (web + app), Outlook (2019+, web), Apple Mail

**Card structure by display mode:**

*Compact:*
```
[Primary photo — full width, max-height 200px]
[Recipe title — heading font, 22px]
[Cook time badge | Servings badge]
[Save This Recipe button]
```

*Standard:*
```
[Primary photo — full width, max-height 280px]
[Recipe title — heading font, 22px]
[Description — 2 lines max, truncated]
[Cook time | Servings | Dietary icons row]
[Ingredients list — up to 8 items, "+ N more" if exceeds]
[Save This Recipe button]
```

*Full:*
```
[Primary photo — full width, max-height 320px]
[Recipe title — heading font, 24px]
[Description]
[Cook time | Servings | Dietary icons row]
[Nutrition summary — if enabled: calories, protein, carbs, fat]
[Ingredients — complete list]
[Instructions — numbered, complete]
[Save This Recipe button]
```

**Brand application:** `primary_color` → button background and heading color. `heading_font` → title (loaded via Google Fonts `<link>` in `<head>`). `body_font` → body text. If Google Fonts is unavailable, fallback is `Georgia` for heading and `Arial` for body.

### 5.4 Save This Recipe CTA

The Save This Recipe button is a tracked link. When the creator inserts a recipe card, [PRODUCT] generates a unique tracked URL for that send:

```
https://app.[product-domain].com/save/{creator_id}/{recipe_slug}?ck={kit_subscriber_id_placeholder}
```

Kit replaces `{kit_subscriber_id_placeholder}` with the subscriber's Kit ID at send time using Kit's subscriber variable syntax.

When a subscriber clicks the URL:
1. [PRODUCT] resolves the recipe and subscriber.
2. Calls `tagSubscriber` with `recipe:saved:{recipe_slug}` and all of the recipe's confirmed dietary tags (e.g. `dietary:gluten-free`).
3. Updates the subscriber's `last_recipe_saved` and `last_recipe_saved_at` custom fields.
4. Records a `RecipeEngagementEvent` of type `save_click`.
5. If a Save This Recipe Kit sequence exists for this creator, calls `addSubscriberToSequence`.
6. Redirects the subscriber to the recipe's `source_url` if present, otherwise to the creator's Kit landing page.

Response time for steps 1–5 must complete within 500ms to avoid a noticeable redirect delay.

---

## 6. Recipe Library

### 6.1 CRUD Operations

**Create Recipe**
- `slug` is generated from `title` (URL-safe, lowercase, hyphens). If slug conflicts with an existing recipe for the creator, append a numeric suffix (`lemon-pasta-2`).
- `dietary_tags_confirmed` defaults to `false`.
- If `status` is not provided, defaults to `draft`.
- Triggers dietary auto-tagging asynchronously after creation.
- Triggers nutrition calculation asynchronously after creation if ingredients are present.

**Update Recipe**
- Updating `ingredients` re-triggers nutrition calculation.
- Updating `ingredients` re-triggers dietary auto-tagging and sets `dietary_tags_confirmed` to `false`.
- Updating `title` regenerates `slug` only if slug has not been manually set.
- Setting `email_ready: true` enqueues a broadcast draft creation job (Automation Engine).

**Delete Recipe**
- Soft delete: sets `status: archived`.
- Does not remove from existing Products. Products referencing archived recipes continue to render correctly.
- Does not remove Kit tags already applied to subscribers.

**Recipe Scaling**
- Scaling is a read-only view operation — it does not mutate the Recipe record.
- `GET /recipes/{id}?servings={n}` returns a scaled view where ingredient quantities are multiplied by `n / original_servings`.
- Fractional quantities are reduced to the nearest common fraction (1/4, 1/3, 1/2, 2/3, 3/4) when within 5% of that fraction. Otherwise rendered as decimals rounded to 2 places.

### 6.2 Collections

- A recipe can belong to zero or more collections.
- `Collection.recipe_ids` is an ordered list. The order determines display order in product generation.
- Deleting a recipe removes it from all collections.
- Collections cannot be deleted if they are referenced by a Product in `published` status.

### 6.3 Search and Filter

The library search endpoint supports:
```
GET /recipes?q={text}&dietary_tags={tag,tag}&cuisine={string}&meal_type={type}
  &max_cook_time_minutes={n}&season={season}&collection_id={id}
  &status={active|draft|archived}&email_ready={true|false}
  &sort={created_at|updated_at|engagement_score|title}
  &order={asc|desc}&page={n}&per_page={n}
```

Full-text search (`q`) searches `title`, `description`, `ingredients[].item`, and `notes`. Search is case-insensitive. Multiple terms are AND-joined.

### 6.4 Duplicate Detection

On import completion (before creator review), [PRODUCT] compares the extracted title against existing recipe titles for the creator using normalized string similarity (Jaro-Winkler, threshold 0.85). If a match is found, the ImportJob is flagged with `possible_duplicate: true` and the matched recipe ID is surfaced in the review UI.

---

## 7. Import Pipeline

### 7.1 Supported Sources

| Source Type | Input | Method |
|-------------|-------|--------|
| URL | Recipe page URL | HTML parsing + schema.org extraction + AI fallback |
| Instagram Post | Post URL or caption text | Caption text → AI extraction |
| TikTok / Reel | Video URL | Audio transcription + OCR of video frames → AI extraction |
| YouTube | Video URL | Audio transcription + description text → AI extraction |
| Screenshot / Photo | Uploaded image file | OCR → AI extraction |
| WordPress Sync | WordPress site URL + API key | WP REST API + WP Recipe Maker/Tasty Recipes JSON |

### 7.2 Import Job Lifecycle

```
pending → processing → needs_review → completed
                    ↘ failed
```

- `pending`: Job created, not yet started.
- `processing`: AI extraction in progress. Maximum duration: 60 seconds. If exceeded, transitions to `failed`.
- `needs_review`: Extraction complete. `RecipeExtract` is populated. Awaiting creator review in the UI.
- `completed`: Creator confirmed the extract. `Recipe` record created. `ImportJob.recipe_id` set.
- `failed`: Extraction failed or timed out. `error` field populated with a user-readable message.

### 7.3 URL Import

1. Fetch HTML from URL (timeout: 10s, follow up to 3 redirects).
2. Attempt to parse `application/ld+json` schema.org `Recipe` block. If found and complete (title + ingredients + instructions present), use directly with confidence 0.95.
3. If schema.org is absent or incomplete, extract the visible text content from the page and pass to the AI extraction model with the following prompt contract:

   **System:** You are a recipe extraction assistant. Extract recipe data from the provided webpage text. Return only valid JSON matching the RecipeExtract schema. If a field cannot be reliably extracted, return null for that field and a confidence score below 0.7.  
   **User:** [page text, max 8,000 tokens]

4. Parse AI response into `RecipeExtract`. Set `status: needs_review`.

### 7.4 Social / Video Import

**Instagram Post:**
- Accept post URL or raw caption text.
- If URL provided: attempt to extract caption via public oEmbed API. If oEmbed fails (private account, rate limit), prompt creator to paste the caption text manually.
- Pass caption text to AI extraction model.

**TikTok / Reel:**
- Download video audio track.
- Transcribe audio using a speech-to-text model.
- Extract keyframes at 2fps, run OCR on each frame, concatenate unique text segments.
- Combine transcript + OCR text, pass to AI extraction model.
- Maximum video duration: 10 minutes. Videos exceeding this are rejected with an error.

**YouTube:**
- Fetch video description text via YouTube Data API v3.
- Fetch auto-generated captions via YouTube captions API if available.
- Combine description + captions, pass to AI extraction model.
- Fall back to description-only if captions are unavailable.

### 7.5 Screenshot / Photo OCR

1. Accept JPEG, PNG, HEIC, or WebP. Maximum file size: 20MB.
2. Convert to PNG if HEIC.
3. Pass image to vision model for combined OCR + extraction in a single pass.
4. If the image is detected as handwritten (confidence > 0.7 from vision model), apply handwriting-specific OCR pre-processing.

### 7.6 WordPress Sync

**Setup:**
1. Creator provides their WordPress site URL and a WordPress Application Password.
2. [PRODUCT] tests the connection by calling `GET /wp-json/wp/v2/users/me` and verifying a `200` response.
3. [PRODUCT] detects which recipe plugin is active: attempts `GET /wp-json/wprm/v3/recipe` (WP Recipe Maker) and `GET /wp-json/tasty-recipes/v1/recipes` (Tasty Recipes). Uses whichever returns `200`.

**Sync behavior:**
- Sync runs on creator request or on a 24-hour schedule.
- For each recipe in the WordPress plugin API response, [PRODUCT] checks if a Recipe record with matching `wordpress_recipe_id` exists.
  - If no match: create a new Recipe with `source_type: wordpress_sync`, `status: draft`, `dietary_tags_confirmed: false`.
  - If match exists and WordPress `modified` date is newer than `Recipe.updated_at`: update ingredient, instruction, and timing fields. Do not overwrite creator edits to `title`, `description`, `notes`, or `photos` unless explicitly requested.
- Recipes deleted from WordPress are not deleted from [PRODUCT]. They are flagged `wordpress_deleted: true` for creator review.

### 7.7 Bulk Social Import

1. Creator connects Instagram or TikTok via OAuth.
2. [PRODUCT] fetches the creator's recent posts (up to 200, sorted by recency).
3. Each post is scored for recipe likelihood using a classifier (keyword presence, structure, hashtags). Posts scoring below 0.4 are excluded.
4. Remaining posts are presented as a review queue, ordered by score descending.
5. Creator marks each as: import, skip, or "not a recipe."
6. Selected posts are queued as individual ImportJobs and processed in parallel (max 5 concurrent).

---

## 8. Digital Product Builder

### 8.1 Product Types

**Ebook**
- Assembled from an ordered list of recipes grouped into chapters.
- Supports intro copy (ebook-level and chapter-level), author bio, and cover page.
- Exports as PDF (8.5×11 or 6×9) and EPUB.

**Meal Plan**
- Assembled from a day-by-day meal assignment grid.
- Includes a consolidated shopping list generated from all assigned recipes.
- Exports as PDF only.

**Recipe Card Pack**
- A set of individually formatted recipe cards (4×6 or 5×7).
- Each card contains: primary photo, title, cook time, ingredients, instructions.
- Exports as multi-page PDF (one card per page).

**Lead Magnet**
- A subset of an existing ebook or recipe card pack (3–5 recipes).
- Automatically generated from the parent product.
- Always paired with a Kit opt-in form and delivery sequence.

### 8.2 Product Assembly

**Ebook assembly steps:**
1. Creator selects a Collection or manually selects recipes.
2. AI chapter organization (see 8.3) is invoked and presented for review.
3. Creator confirms or modifies chapter structure.
4. AI intro + headnote copy (see 8.3) is generated and presented for review.
5. Creator edits copy.
6. Nutrition facts are auto-populated for all recipes with `nutrition` data.
7. Creator selects template and previews rendered output.
8. Creator confirms. PDF and EPUB rendering is enqueued.
9. When rendering completes, file URLs are stored on the Product record.

**Meal plan assembly steps:**
1. Creator selects number of days (5, 7, 14, or 28).
2. Creator assigns recipes to meal slots from their library.
3. [PRODUCT] generates consolidated shopping list from all assigned recipes, merging duplicate ingredients and organizing by grocery section (produce, dairy, meat, pantry, etc.).
4. Creator previews and confirms.
5. PDF rendering is enqueued.

### 8.3 AI Assistance

**Chapter organization:**  
Input: ordered list of Recipe records (title, dietary_tags, meal_type, cuisine, cook_time_minutes).  
Output: suggested chapter groupings with names.  
Model is prompted to group by logical affinity (cuisine, meal occasion, dietary theme, season). Output is a list of `{ chapter_title: string, recipe_indices: integer[] }`. Creator can drag recipes between chapters and rename chapters.

**Intro and headnote copy:**  
Input: Product metadata, chapter names, recipe titles and descriptions.  
Output: `{ ebook_intro: string, chapters: { title: string, intro: string }[], headnotes: { recipe_id: UUID, headnote: string }[] }`.  
All AI copy is stored with `ai_copy_reviewed: false` until the creator edits and saves it. Products cannot be published while `ai_copy_reviewed: false`.

**Constraints on AI copy:**
- Ebook intro: 100–300 words.
- Chapter intro: 50–150 words.
- Recipe headnote: 30–80 words.
- Voice: warm, personal, first-person. No marketing superlatives ("amazing," "delicious," "incredible").

### 8.4 PDF Rendering

PDF rendering uses a headless browser (Chromium) to render an HTML template to PDF.

**Template system:**
- Templates are HTML/CSS files stored in [PRODUCT]'s template library.
- Templates use a mustache-compatible variable syntax: `{{recipe.title}}`, `{{recipe.ingredients}}`, etc.
- Templates are rendered with the creator's BrandKit values injected as CSS custom properties.
- Google Fonts are loaded for the creator's configured heading and body fonts.

**Rendering constraints:**
- Max rendering time: 120 seconds per product.
- If rendering exceeds this, the job fails and the creator is notified.
- Rendered PDFs are stored in object storage (S3-compatible) and served via CDN.
- PDF URLs are signed and expire after 24 hours for draft products; permanent URLs for published products.

### 8.5 Lead Magnet Generation

When a creator requests a lead magnet from an existing product:
1. Select the top 3–5 recipes from the product by `engagement_score` (highest first). If engagement scores are unavailable, select the first 5 recipes.
2. Generate a condensed PDF using the same template as the parent product.
3. Add a last page: "Get the full [Product Title]" with the Stan Store / Gumroad URL if the parent is published, or a placeholder URL if not yet published.
4. Create a `Product` record with `type: lead_magnet` and `lead_magnet_product_id` pointing to the parent.
5. Automatically create a Kit opt-in form (see 8.6) and Kit delivery sequence (see 10.3).

### 8.6 Kit Form Generation

When a lead magnet is created, [PRODUCT] creates a Kit form via the Kit API:

```
createForm({
  name: "{Product Title} — Free Sample",
  type: "inline",
  redirect_url: null,    // delivery handled by Kit sequence
  custom_fields: ["preferred_dietary_tags"],
  tags_on_subscribe: ["product:sampler:{product_id_short}"]
})
```

The form embed code is stored on the Product record and displayed in the creator's dashboard for embedding on their website or Substack.

---

## 9. Segmentation Engine

### 9.1 Dietary Preference Data Sources

Subscriber dietary preferences are populated from two sources, in priority order:

1. **Explicit preference capture**: When a subscriber signs up through a [PRODUCT]-generated Kit form, they may select dietary preferences. Selections are stored in the `preferred_dietary_tags` custom field as a comma-separated list.

2. **Behavioral inference**: Each time a subscriber clicks Save This Recipe on a recipe with confirmed dietary tags, those tags are added to the subscriber's Kit tag set via `tagSubscriber`.

### 9.2 Preference Capture Form

[PRODUCT] generates a Kit form specifically for dietary preference collection. This form can be used standalone (for list-building campaigns) or embedded in a lead magnet opt-in flow.

The form includes a multi-select field for: Gluten-Free, Dairy-Free, Vegan, Vegetarian, Keto, Paleo, Nut-Free.

Selected preferences are written to the Kit subscriber's `preferred_dietary_tags` custom field on form submit.

### 9.3 Auto-Tagging on Recipe Import

When a Recipe is created or updated with new ingredients, [PRODUCT] runs dietary tag inference:

**Rules (applied in order, all ingredients must satisfy the rule unless noted):**
- `vegan`: no meat, poultry, seafood, dairy, eggs, honey.
- `vegetarian`: no meat, poultry, seafood. Dairy and eggs are permitted.
- `gluten-free`: no wheat, barley, rye, malt, triticale, or ingredients flagged as containing gluten. Oats are flagged as ambiguous.
- `dairy-free`: no milk, cream, butter, cheese, yogurt, whey, casein, lactose, ghee.
- `keto`: total_carbs_g (per serving) ≤ 10g AND total_fat_g > total_protein_g.
- `paleo`: no grains, legumes, dairy, refined sugar, processed oils. This is a classification signal, not a strict rule — confidence is capped at 0.7.
- `nut-free`: no almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia, brazil nuts, peanuts, or tree nut derivatives.
- `egg-free`: no eggs or egg derivatives.

Tags are stored with `dietary_tags_confirmed: false`. The creator sees them in the recipe edit UI and can confirm, modify, or reject each tag. Once the creator confirms, `dietary_tags_confirmed` is set to `true`.

Only recipes with `dietary_tags_confirmed: true` propagate their tags to Kit subscribers via Save This Recipe.

### 9.4 Segment Analytics

The Segmentation Engine computes a `SegmentProfile` for each creator on a 24-hour schedule and on demand.

For each `DietaryTag`, the profile includes:
- `subscriber_count`: Kit subscribers with `dietary:{tag_slug}` tag.
- `engagement_rate`: fraction of tagged subscribers who have at least one `save_click` event in the last 30 days.
- `growth_rate_30d`: percentage change in subscriber_count over the last 30 days.
- `top_recipes`: the 3 recipes with the most `save_click` events from subscribers in this segment.

---

## 10. Automation Engine

### 10.1 Save This Recipe Sequence

**Trigger:** A subscriber clicks a Save This Recipe CTA (Kit webhook: `link.clicked` on a Save URL).

**Behavior:**

1. Check if the creator has a Save This Recipe sequence configured. If not, no sequence action is taken (tags and custom fields are still updated per section 5.4).

2. Check if the subscriber is already in this sequence (Kit API). If yes, skip re-enrollment to avoid duplicate sequences.

3. Determine the sequence to enroll in:
   - If the saved recipe belongs to a Collection that is associated with a published Product, enroll in that Product's nurture sequence.
   - Otherwise, enroll in the creator's default Save This Recipe sequence.

4. Call `addSubscriberToSequence(subscriber_id, sequence_id)`.

**Default Save This Recipe sequence structure (created automatically on first sequence setup):**
```
Day 0: Delivery email — "Here's your saved recipe: {recipe title}" — PDF card attached
Day 3: Follow-up — 2 more recipes from the same Collection (if available)
Day 7: Soft pitch — link to the Product associated with this Collection (if published)
```

Sequence emails are created as Kit sequence emails via Kit's sequence API. All email content is HTML, using a minimal template that respects the creator's brand kit.

### 10.2 New Recipe Broadcast Draft

**Trigger:** A Recipe's `email_ready` field is set to `true`.

**Behavior:**
1. Check that the creator has at least one Kit broadcast template configured. If not, use [PRODUCT]'s default email template.
2. Create a Kit broadcast draft via `createBroadcastDraft`:
   - `subject`: "[Recipe Title] — a new recipe for you"
   - `content`: Recipe card block (Standard mode) + blank intro text placeholder
   - `description`: "[PRODUCT] auto-draft — {recipe.title}"
   - `send_at`: null (draft only, creator schedules manually)
3. Notify the creator in [PRODUCT]'s dashboard: "Your Kit draft is ready — {recipe title}."

The creator opens Kit, finds the draft pre-populated, writes their intro, and sends. [PRODUCT] does not send broadcasts on behalf of the creator.

### 10.3 Lead Magnet Delivery Sequence

Created automatically when a lead magnet Product is generated.

**Sequence structure:**
```
Day 0: Delivery — "Here's your free [Lead Magnet Title]!" — PDF attached
Day 2: Value email — "3 tips for [lead magnet topic]" (AI-generated draft, creator edits)
Day 4: Value email — "Another recipe from [creator name]" — recipe card block
Day 7: Pitch — "Get the full [Product Title]" — link to Stan Store / Gumroad listing
```

Sequence is created in Kit via the sequences API. All emails are HTML drafts. Creator must review and activate the sequence in Kit.

### 10.4 Seasonal Recipe Drops

Creator configures a seasonal drop:
- Season label (e.g. "Holiday Baking")
- Start date and end date (annual recurrence or specific year)
- Collection to draw from
- Target segment (dietary tag filter, or all subscribers)

On the start date, the Automation Engine creates a Kit broadcast draft featuring a recipe card from the specified collection (selected by engagement_score, highest first among untapped recipes in the season). Creator receives a dashboard notification.

The Automation Engine does not auto-send. It creates drafts. All sends are initiated by the creator in Kit.

---

## 11. Analytics Engine

### 11.1 Event Ingestion

RecipeEngagementEvents are recorded from:
- Kit webhooks (`link.clicked` on Save This Recipe URLs → `save_click`)
- Kit webhooks (`subscriber.tag_added` for `recipe:saved:*` tags → `save_click` secondary confirmation)
- Kit webhooks (`purchase.completed`) → `purchase_attribution`
- [PRODUCT] internal events (recipe card inserted into a broadcast → `card_view` when broadcast is sent)

Events are stored in append-only fashion with creator_id, recipe_id, and subscriber ID (hashed for privacy in aggregate views).

### 11.2 Engagement Score

Each recipe's `engagement_score` is a float on a 0–10 scale, computed on a 24-hour schedule:

```
score = (
  (save_clicks_30d * 3.0) +
  (sequence_triggers_30d * 2.0) +
  (card_views_30d * 1.0) +
  (purchase_attributions_all_time * 4.0)
) / normalization_factor
```

`normalization_factor` scales the score to the 0–10 range based on the creator's top-performing recipe (so scores are relative to each creator's own performance, not absolute).

Recipes with no events have `engagement_score: null`.

### 11.3 Product Recommendation Engine

After each SegmentProfile computation, the engine checks for product opportunities:

**Trigger condition:** A dietary segment has `subscriber_count ≥ 50` AND `engagement_rate ≥ 0.15` AND the creator has ≥ 5 recipes with that dietary tag AND `dietary_tags_confirmed: true`.

**Output:** A recommendation notification in the creator's dashboard:
```
"{segment_count} of your subscribers engage most with {dietary_tag} recipes.
You have {recipe_count} {dietary_tag} recipes with an average engagement score of {avg_score}.
This could be your next ebook."
[Create ebook →]
```

Clicking "Create ebook" pre-populates the Product Builder with all matching recipes filtered by that dietary tag, sorted by engagement_score descending.

Recommendations are shown at most once per dietary tag per 30-day period.

### 11.4 Revenue Attribution

When a `purchase.completed` Kit webhook fires:
1. Identify the subscriber via Kit subscriber ID.
2. Find all `save_click` events for that subscriber in the 30 days before the purchase.
3. Find the Product purchased by matching the purchase description or external product ID.
4. If any saved recipes are in the purchased Product, record a `purchase_attribution` event for each matching recipe.

Attribution window: 30 days. Last-touch model (the most recent save before purchase is the primary attributed recipe, but all saves within the window are recorded).

---

## 12. Publishing Pipeline

### 12.1 Supported Platforms

| Platform | Integration Method | Auth |
|----------|-------------------|------|
| Stan Store | Stan Store API (if available) or creator-provided credentials | OAuth or API key |
| Gumroad | Gumroad API v2 | OAuth |
| LTK | LTK Partner API | API key |

**Fallback:** If a platform's API is unavailable or the creator has not connected an account, [PRODUCT] packages the product files into a ZIP and provides a download link with manual upload instructions.

### 12.2 Publishing Flow

1. Creator selects "Publish" on a completed Product.
2. Creator selects destination platform(s).
3. Creator sets a price (display only — [PRODUCT] does not process payments).
4. [PRODUCT] calls the platform API to create a listing with:
   - Product title and description
   - PDF file (uploaded via platform file API)
   - Price
5. On success, stores a `PublishedListing` record with the listing URL.
6. If the product has an associated lead magnet, updates the lead magnet's Day 7 pitch email URL with the listing URL.

### 12.3 Social Share Asset Generation

When a Product is published, [PRODUCT] generates three share assets via a canvas/image generation service:
- Square (1080×1080px) — for Instagram feed
- Vertical (1080×1920px) — for TikTok/Reels cover
- Story (1080×1920px with safe zones respected) — for Instagram/TikTok Stories

Each asset contains:
- Creator's primary brand color as background
- Product cover image (if available) or primary photo of the first recipe
- Product title in heading font
- CTA text: "Get it free" (lead magnet) or "Available now" (paid product)
- Creator's logo (if present in brand kit)

Assets are rendered as PNG and available for download in the creator's dashboard.

---

## 13. Authentication & Multi-tenancy

### 13.1 Creator Authentication

[PRODUCT] uses email + password authentication with:
- Passwords hashed with bcrypt (cost factor 12).
- Email verification required before Kit OAuth connection is permitted.
- Session tokens: JWT, 7-day expiry, refreshed on each authenticated request.
- Rate limiting: 10 failed login attempts per IP per hour before CAPTCHA is required.

OAuth via Kit is available as a secondary auth method after initial email/password signup.

### 13.2 Data Isolation

All database queries are scoped by `creator_id`. There are no shared recipe, product, or analytics records between creators. Row-level security policies on all tables enforce `creator_id` isolation at the database level.

### 13.3 Studio Tier: Team Members

Studio tier creators can invite up to 3 team members. Team members share access to the creator's library, products, and analytics. Team members cannot:
- Disconnect the Kit integration
- Change billing or subscription tier
- Delete the account

Team member access is revocable by the account owner at any time.

### 13.4 Studio Tier: Multiple Brand Kits

Studio tier creators can create multiple BrandKit records. Each Product is associated with exactly one BrandKit at creation time. Changing a Product's BrandKit requires re-rendering the PDF.

---

## 14. Error Handling

### 14.1 Import Failures

| Condition | Behavior |
|-----------|----------|
| URL fetch timeout | Retry once after 5s. On second failure, mark ImportJob `failed` with message: "Could not reach this URL. Please try again or paste the recipe text manually." |
| AI extraction produces no title or no ingredients | Mark `failed` with message: "We couldn't extract a recipe from this source. Try pasting the text directly." |
| AI extraction confidence < 0.5 on all fields | Mark `needs_review` with a warning banner in the review UI: "This extraction has low confidence — please review carefully." |
| Video longer than 10 minutes | Reject immediately with message: "Videos must be under 10 minutes. Try a shorter clip." |
| Image > 20MB | Reject immediately with message: "Images must be under 20MB." |
| WordPress API returns 401 | Mark sync failed. Prompt creator to regenerate their WordPress Application Password. |

### 14.2 Kit API Failures

| Condition | Behavior |
|-----------|----------|
| Rate limit hit (429) | Queue request. Retry with exponential backoff. Do not surface to creator unless delay exceeds 30 seconds. |
| Token expired | Attempt refresh. If refresh succeeds, retry original request. |
| Token refresh fails (401) | Mark Kit connection `disconnected`. All Kit-dependent features disabled. Creator notified on next dashboard load. |
| Kit API returns 5xx | Retry up to 3 times with exponential backoff (1s, 4s, 16s). On third failure, log and surface an error notification to the creator. |
| Webhook delivery fails | Acknowledged by returning `200` immediately (async processing). If async processing fails, the event is dead-lettered and logged. Do not retry webhook delivery — Kit handles that. |

### 14.3 PDF Rendering Failures

| Condition | Behavior |
|-----------|----------|
| Rendering timeout (120s) | Mark product rendering `failed`. Notify creator. Offer retry. |
| Google Fonts load failure | Fall back to system fonts (Georgia / Arial). Log the failure. Do not block rendering. |
| Missing recipe photo | Render a placeholder background using the creator's primary brand color. |

### 14.4 Publishing Failures

| Condition | Behavior |
|-----------|----------|
| Platform API unavailable | Surface error to creator. Offer the manual download + instructions fallback. |
| File upload rejected by platform | Surface platform error message to creator verbatim. |
| Platform listing creation succeeds but URL not returned | Store `PublishedListing` with `listing_url: null`. Creator prompted to add URL manually. |

---

## 15. Constraints & Non-Goals

### 15.1 Constraints

- **Kit-exclusive in v1.** All email, subscriber, sequence, and form functionality depends on Kit's V4 API. No other email platform is supported.
- **No email sending.** [PRODUCT] creates drafts and sequences in Kit. It never sends an email directly.
- **No payment processing.** [PRODUCT] does not accept payments. Product pricing is display-only. All transactions occur on Stan Store, Gumroad, LTK, or Kit Commerce.
- **No storefront.** [PRODUCT] does not host a creator storefront. It publishes to external platforms.
- **No recipe generation.** AI is used for extraction, organization, copy assistance, and classification. It does not generate recipe content.
- **Free tier limits:** 25 recipes, 3 recipe card email sends/month, 1 published product. Enforced by the application layer. Hard limits, not soft warnings.

### 15.2 Non-Goals

The following are explicitly out of scope and should not be built:

- Social media post scheduling
- Video editing or transcription output beyond recipe extraction
- A native email editor (Kit's editor is used via the plugin)
- A native comment or community system
- A recipe discovery feed for consumers
- Native checkout or digital delivery infrastructure
- Multi-platform email support (Beehiiv, MailerLite, Flodesk) — deferred to v2
- Mobile native apps (iOS/Android) — the web application is responsive and covers mobile use cases
- Recipe nutrition label certification or medical dietary claims

---

*End of specification.*
