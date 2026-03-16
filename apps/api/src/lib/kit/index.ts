// ---------------------------------------------------------------------------
// Kit Integration Layer — barrel export
// ---------------------------------------------------------------------------
// This module is the ONLY place in the codebase that interacts with Kit's
// V4 API. All other components go through this module.
// ---------------------------------------------------------------------------

// Client
export type { KitClientConfig, FetchFn } from "./client.js";
export {
  getSubscriber,
  createSubscriber,
  updateSubscriber,
  tagSubscriber,
  untagSubscriber,
  listTags,
  createTag,
  getOrCreateTag,
  listCustomFields,
  createCustomField,
  getOrCreateCustomField,
  createBroadcastDraft,
  getBroadcast,
  listSequences,
  addSubscriberToSequence,
  listForms,
  addSubscriberToForm,
  createPurchase,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
} from "./client.js";

// Types
export type {
  KitApiError,
  KitApiErrorCode,
  KitSubscriber,
  KitSubscriberApiState,
  KitTag,
  KitCustomField,
  KitBroadcast,
  KitEmailTemplate,
  BroadcastDraftParams,
  SubscriberFilterGroup,
  SubscriberFilterCondition,
  KitSequence,
  KitForm,
  KitPurchaseParams,
  KitPurchaseProduct,
  KitPurchase,
  KitWebhook,
  KitWebhookEvent,
  KitWebhookRegistrationEvent,
  KitWebhookEventName,
  KitPagination,
  KitOAuthTokenResponse,
} from "./types.js";
export {
  KIT_API_ERROR_CODE,
  KIT_SUBSCRIBER_API_STATE,
  KIT_WEBHOOK_EVENT,
} from "./types.js";

// OAuth
export type { KitOAuthScope } from "./oauth.js";
export {
  getAuthorizationUrl,
  exchangeCode,
  refreshToken,
  KIT_OAUTH_SCOPES,
  deriveEncryptionKey,
  encryptToken,
  decryptToken,
} from "./oauth.js";

// Token middleware
export type {
  StoredTokenInfo,
  ResolvedToken,
  TokenDisconnectedError,
  TokenRefreshError,
  TokenMiddlewareError,
} from "./token-middleware.js";
export { resolveAccessToken } from "./token-middleware.js";

// Rate limiter
export type { RateLimiter, RateLimitError } from "./rate-limiter.js";
export {
  InMemoryRateLimiter,
  withRateLimitRetry,
} from "./rate-limiter.js";

// Webhooks
export type {
  WebhookVerificationError,
  KitWebhookPayload,
} from "./webhooks.js";
export { verifyWebhookSignature } from "./webhooks.js";

// Tag conventions
export type { KitCustomFieldLabel } from "./tag-conventions.js";
export {
  dietaryTagName,
  recipeSavedTagName,
  productPurchasedTagName,
  KIT_CUSTOM_FIELD_LABELS,
} from "./tag-conventions.js";
