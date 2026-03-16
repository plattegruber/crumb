// ---------------------------------------------------------------------------
// Kit V4 API types
// ---------------------------------------------------------------------------
// These types mirror the Kit V4 API response shapes as documented at
// https://developers.kit.com/v4. They are used exclusively within the
// Kit Integration Layer.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Structured error returned by the Kit API client.
 *
 * - `status` is the HTTP status code from Kit (or 0 for network errors).
 * - `code` is a machine-readable error code.
 * - `messages` contains the error strings from Kit's `errors` array.
 */
export interface KitApiError {
  readonly status: number;
  readonly code: KitApiErrorCode;
  readonly messages: readonly string[];
}

export const KIT_API_ERROR_CODE = {
  Unauthorized: "unauthorized",
  NotFound: "not_found",
  ValidationError: "validation_error",
  RateLimited: "rate_limited",
  Forbidden: "forbidden",
  ServerError: "server_error",
  NetworkError: "network_error",
  Unknown: "unknown",
} as const;

export type KitApiErrorCode =
  (typeof KIT_API_ERROR_CODE)[keyof typeof KIT_API_ERROR_CODE];

// ---------------------------------------------------------------------------
// Subscriber
// ---------------------------------------------------------------------------

export interface KitSubscriber {
  readonly id: number;
  readonly first_name: string | null;
  readonly email_address: string;
  readonly state: KitSubscriberApiState;
  readonly created_at: string;
  readonly fields: Readonly<Record<string, string | null>>;
}

export const KIT_SUBSCRIBER_API_STATE = {
  Active: "active",
  Cancelled: "cancelled",
  Bounced: "bounced",
  Complained: "complained",
  Inactive: "inactive",
} as const;

export type KitSubscriberApiState =
  (typeof KIT_SUBSCRIBER_API_STATE)[keyof typeof KIT_SUBSCRIBER_API_STATE];

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export interface KitTag {
  readonly id: number;
  readonly name: string;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Custom Field
// ---------------------------------------------------------------------------

export interface KitCustomField {
  readonly id: number;
  readonly name: string;
  readonly key: string;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

export interface KitBroadcast {
  readonly id: number;
  readonly created_at: string;
  readonly subject: string;
  readonly preview_text: string | null;
  readonly description: string | null;
  readonly content: string | null;
  readonly public: boolean;
  readonly published_at: string | null;
  readonly send_at: string | null;
  readonly thumbnail_alt: string | null;
  readonly thumbnail_url: string | null;
  readonly email_address: string | null;
  readonly email_template: KitEmailTemplate | null;
}

export interface KitEmailTemplate {
  readonly id: number;
  readonly name: string;
}

/**
 * Parameters for creating a broadcast draft via the Kit API.
 * Maps to SPEC 4.2 BroadcastDraftParams.
 */
export interface BroadcastDraftParams {
  readonly subject: string;
  readonly content: string;
  readonly description: string;
  readonly email_template_id: number | null;
  readonly subscriber_filter: readonly SubscriberFilterGroup[] | null;
  readonly send_at: string | null;
}

export interface SubscriberFilterGroup {
  readonly all: readonly SubscriberFilterCondition[];
}

export interface SubscriberFilterCondition {
  readonly type: string;
  readonly id?: number;
}

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

export interface KitSequence {
  readonly id: number;
  readonly name: string;
  readonly hold: boolean;
  readonly repeat: boolean;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export interface KitForm {
  readonly id: number;
  readonly name: string;
  readonly created_at: string;
  readonly type: string;
  readonly format: string | null;
  readonly embed_js: string;
  readonly embed_url: string;
  readonly archived: boolean;
  readonly uid: string;
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

export interface KitPurchaseParams {
  readonly email_address: string;
  readonly transaction_id: string;
  readonly status: string;
  readonly subtotal: number;
  readonly tax: number;
  readonly discount: number;
  readonly total: number;
  readonly shipping: number;
  readonly currency: string;
  readonly transaction_time: string;
  readonly products: readonly KitPurchaseProduct[];
}

export interface KitPurchaseProduct {
  readonly name: string;
  readonly pid: string;
  readonly lid: string;
  readonly quantity: number;
  readonly unit_price: number;
  readonly sku: string;
}

export interface KitPurchase {
  readonly id: number;
  readonly subscriber_id: number;
  readonly transaction_id: string;
  readonly status: string;
  readonly email_address: string;
  readonly currency: string;
  readonly transaction_time: string;
  readonly subtotal: number;
  readonly discount: number;
  readonly tax: number;
  readonly total: number;
  readonly products: readonly KitPurchaseProduct[];
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface KitWebhook {
  readonly id: number;
  readonly account_id: number;
  readonly event: KitWebhookEvent;
  readonly target_url: string;
}

export interface KitWebhookEvent {
  readonly name: string;
  readonly initiator_value?: string | null;
  readonly tag_id?: number | null;
  readonly form_id?: number | null;
  readonly sequence_id?: number | null;
  readonly product_id?: number | null;
  readonly custom_field_id?: number | null;
}

export interface KitWebhookRegistrationEvent {
  readonly name: string;
  readonly form_id?: number | null;
  readonly tag_id?: number | null;
  readonly sequence_id?: number | null;
  readonly product_id?: number | null;
  readonly initiator_value?: string | null;
  readonly custom_field_id?: number | null;
}

// ---------------------------------------------------------------------------
// Webhook payload event types (SPEC 4.3)
// ---------------------------------------------------------------------------

export const KIT_WEBHOOK_EVENT = {
  SubscriberActivate: "subscriber_activate",
  SubscriberUnsubscribe: "subscriber_unsubscribe",
  TagAdd: "tag_add",
  TagRemove: "tag_remove",
  PurchaseCreate: "purchase_create",
  LinkClick: "link_click",
  FormSubscribe: "form_subscribe",
  CourseSubscribe: "course_subscribe",
  CourseComplete: "course_complete",
  SubscriberBounce: "subscriber_bounce",
  SubscriberComplain: "subscriber_complain",
} as const;

export type KitWebhookEventName =
  (typeof KIT_WEBHOOK_EVENT)[keyof typeof KIT_WEBHOOK_EVENT];

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface KitPagination {
  readonly has_previous_page: boolean;
  readonly has_next_page: boolean;
  readonly start_cursor: string;
  readonly end_cursor: string;
  readonly per_page: number;
}

// ---------------------------------------------------------------------------
// OAuth token response
// ---------------------------------------------------------------------------

export interface KitOAuthTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
  readonly created_at: number;
}
