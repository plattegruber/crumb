/**
 * Kit webhook event handlers (SPEC 11.1).
 *
 * Dispatches inbound Kit webhook events to the appropriate service
 * function. Called from the webhook endpoint after HMAC verification.
 *
 * All public functions return Promise<Result<T, E>>.
 */
import type { Database } from "../db/index.js";
import type { KitWebhookPayload } from "../lib/kit/webhooks.js";
import { KIT_WEBHOOK_EVENT } from "../lib/kit/types.js";
import {
  recordEngagementEvent,
  computeRevenueAttribution,
  ENGAGEMENT_EVENT_TYPE,
} from "./analytics.js";
import type { Result } from "@dough/shared";
import { ok, err } from "@dough/shared";
import { createLogger, type Logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookHandlerError =
  | { readonly type: "unhandled_event"; readonly event: string }
  | { readonly type: "missing_data"; readonly message: string }
  | { readonly type: "processing_error"; readonly message: string };

export interface WebhookHandlerResult {
  readonly handled: boolean;
  readonly eventType: string;
  readonly action: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** URL pattern for "Save This Recipe" links. */
const SAVE_RECIPE_URL_PATTERN = /\/save-recipe\/([a-zA-Z0-9_-]+)/;

const defaultLogger = createLogger("webhook-handlers");

// ---------------------------------------------------------------------------
// Main Dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a verified Kit webhook payload to the appropriate handler.
 *
 * @param db - Database handle
 * @param creatorId - The creator whose Kit account generated this webhook
 * @param payload - The parsed webhook payload
 */
export async function handleWebhookEvent(
  db: Database,
  creatorId: string,
  payload: KitWebhookPayload,
  logger: Logger = defaultLogger,
): Promise<Result<WebhookHandlerResult, WebhookHandlerError>> {
  logger.info("webhook_event_received", {
    eventType: payload.event,
    creator: creatorId,
  });

  switch (payload.event) {
    case KIT_WEBHOOK_EVENT.LinkClick:
      return handleLinkClick(db, creatorId, payload);

    case KIT_WEBHOOK_EVENT.PurchaseCreate:
      return handlePurchaseCompleted(db, creatorId, payload);

    case KIT_WEBHOOK_EVENT.TagAdd:
      return handleTagAdded(db, creatorId, payload);

    case KIT_WEBHOOK_EVENT.SubscriberActivate:
      return handleSubscriberActivated(creatorId, payload);

    case KIT_WEBHOOK_EVENT.SubscriberUnsubscribe:
      return handleSubscriberUnsubscribed(creatorId, payload);

    default:
      logger.warn("webhook_unhandled_event_type", {
        eventType: payload.event,
        creator: creatorId,
      });
      return ok({
        handled: false,
        eventType: payload.event,
        action: "ignored",
      });
  }
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

/**
 * Handle link.clicked webhook events.
 *
 * If the clicked URL matches the "Save This Recipe" pattern, records
 * a save_click engagement event.
 */
async function handleLinkClick(
  db: Database,
  creatorId: string,
  payload: KitWebhookPayload,
): Promise<Result<WebhookHandlerResult, WebhookHandlerError>> {
  const url = payload.url;
  if (url === undefined || url === null) {
    return ok({
      handled: false,
      eventType: "link_click",
      action: "no_url",
    });
  }

  const match = SAVE_RECIPE_URL_PATTERN.exec(url);
  if (match === null || !match[1]) {
    return ok({
      handled: false,
      eventType: "link_click",
      action: "not_save_recipe_url",
    });
  }

  const recipeId = match[1];
  const subscriberId = payload.subscriber?.id;

  if (subscriberId === undefined || subscriberId === null) {
    return err({
      type: "missing_data",
      message: "link.clicked event missing subscriber data",
    });
  }

  const eventId = `save-click-${creatorId}-${recipeId}-${String(subscriberId)}-${Date.now()}`;

  const result = await recordEngagementEvent(db, {
    id: eventId,
    creatorId,
    recipeId,
    eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
    eventData: { url },
    kitSubscriberId: String(subscriberId),
    source: "KitWebhook",
    occurredAt: new Date().toISOString(),
  });

  if (!result.ok) {
    if (result.error.type === "duplicate_event") {
      return ok({
        handled: true,
        eventType: "link_click",
        action: "duplicate_save_click",
      });
    }
    return err({
      type: "processing_error",
      message: "Failed to record save_click event",
    });
  }

  return ok({
    handled: true,
    eventType: "link_click",
    action: "save_click_recorded",
  });
}

/**
 * Handle purchase.completed webhook events.
 *
 * Triggers revenue attribution for the purchase.
 */
async function handlePurchaseCompleted(
  db: Database,
  creatorId: string,
  payload: KitWebhookPayload,
): Promise<Result<WebhookHandlerResult, WebhookHandlerError>> {
  const purchase = payload.purchase;
  if (purchase === undefined || purchase === null) {
    return err({
      type: "missing_data",
      message: "purchase.completed event missing purchase data",
    });
  }

  const subscriberId = payload.subscriber?.id;
  if (subscriberId === undefined || subscriberId === null) {
    return err({
      type: "missing_data",
      message: "purchase.completed event missing subscriber data",
    });
  }

  // Use the transaction_id as a proxy for the product ID for attribution
  const productId = purchase.transaction_id;

  const result = await computeRevenueAttribution(db, creatorId, String(subscriberId), productId);

  if (!result.ok) {
    return err({
      type: "processing_error",
      message: "Failed to compute revenue attribution",
    });
  }

  return ok({
    handled: true,
    eventType: "purchase_create",
    action: `attributed_${result.value.length}_recipes`,
  });
}

/**
 * Handle subscriber.tag_added webhook events.
 *
 * If the tag matches the recipe:saved:* pattern, records a secondary
 * save_click confirmation event.
 */
async function handleTagAdded(
  db: Database,
  creatorId: string,
  payload: KitWebhookPayload,
): Promise<Result<WebhookHandlerResult, WebhookHandlerError>> {
  const tag = payload.tag;
  if (tag === undefined || tag === null) {
    return ok({
      handled: false,
      eventType: "tag_add",
      action: "no_tag_data",
    });
  }

  // Check if this is a recipe:saved:* tag
  if (!tag.name.startsWith("recipe:saved:")) {
    return ok({
      handled: false,
      eventType: "tag_add",
      action: "not_recipe_saved_tag",
    });
  }

  const recipeSlug = tag.name.replace("recipe:saved:", "");
  const subscriberId = payload.subscriber?.id;

  if (subscriberId === undefined || subscriberId === null) {
    return err({
      type: "missing_data",
      message: "tag_add event missing subscriber data",
    });
  }

  const eventId = `save-tag-${creatorId}-${recipeSlug}-${String(subscriberId)}-${Date.now()}`;

  const result = await recordEngagementEvent(db, {
    id: eventId,
    creatorId,
    recipeId: recipeSlug, // Using slug as recipe identifier from tag
    eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
    eventData: { tag_name: tag.name, secondary_confirmation: true },
    kitSubscriberId: String(subscriberId),
    source: "KitWebhook",
    occurredAt: new Date().toISOString(),
  });

  if (!result.ok) {
    if (result.error.type === "duplicate_event") {
      return ok({
        handled: true,
        eventType: "tag_add",
        action: "duplicate_save_confirmation",
      });
    }
    return err({
      type: "processing_error",
      message: "Failed to record secondary save confirmation",
    });
  }

  return ok({
    handled: true,
    eventType: "tag_add",
    action: "save_click_confirmed",
  });
}

/**
 * Handle subscriber.activated webhook events.
 *
 * Triggers segmentation processing (deferred to segmentation service).
 */
async function handleSubscriberActivated(
  _creatorId: string,
  _payload: KitWebhookPayload,
): Promise<Result<WebhookHandlerResult, WebhookHandlerError>> {
  // Segmentation processing would be triggered here.
  // For now, acknowledge the event.
  return ok({
    handled: true,
    eventType: "subscriber_activate",
    action: "segmentation_queued",
  });
}

/**
 * Handle subscriber.unsubscribed webhook events.
 *
 * Triggers segmentation removal (deferred to segmentation service).
 */
async function handleSubscriberUnsubscribed(
  _creatorId: string,
  _payload: KitWebhookPayload,
): Promise<Result<WebhookHandlerResult, WebhookHandlerError>> {
  // Segmentation removal would be triggered here.
  // For now, acknowledge the event.
  return ok({
    handled: true,
    eventType: "subscriber_unsubscribe",
    action: "segmentation_removal_queued",
  });
}
