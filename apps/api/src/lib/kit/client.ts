// ---------------------------------------------------------------------------
// Kit V4 API Client
// ---------------------------------------------------------------------------
// This is the ONLY module that makes direct HTTP calls to Kit's V4 API.
// All other code in the codebase goes through this client.
//
// API docs: https://developers.kit.com/v4
// ---------------------------------------------------------------------------

import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import { createLogger } from "../logger.js";
import type {
  KitApiError,
  KitSubscriber,
  KitTag,
  KitCustomField,
  KitBroadcast,
  BroadcastDraftParams,
  KitSequence,
  KitForm,
  KitPurchaseParams,
  KitPurchase,
  KitWebhook,
  KitWebhookRegistrationEvent,
  KitPagination,
} from "./types.js";
import { KIT_API_ERROR_CODE } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.kit.com/v4";
const kitLogger = createLogger("kit-client");

// ---------------------------------------------------------------------------
// Fetch function type — allows dependency injection for tests
// ---------------------------------------------------------------------------

export type FetchFn = typeof globalThis.fetch;

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface KitClientConfig {
  /** An injected `fetch` function for testability. */
  readonly fetchFn: FetchFn;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function errorCodeFromStatus(status: number): KitApiError["code"] {
  switch (status) {
    case 401:
      return KIT_API_ERROR_CODE.Unauthorized;
    case 403:
      return KIT_API_ERROR_CODE.Forbidden;
    case 404:
      return KIT_API_ERROR_CODE.NotFound;
    case 422:
      return KIT_API_ERROR_CODE.ValidationError;
    case 429:
      return KIT_API_ERROR_CODE.RateLimited;
    default:
      if (status >= 500) return KIT_API_ERROR_CODE.ServerError;
      return KIT_API_ERROR_CODE.Unknown;
  }
}

interface KitErrorBody {
  errors?: readonly string[];
}

async function parseErrorBody(response: Response): Promise<readonly string[]> {
  try {
    const body = (await response.json()) as KitErrorBody;
    if (Array.isArray(body.errors)) {
      return body.errors;
    }
    return [`HTTP ${response.status}`];
  } catch {
    return [`HTTP ${response.status}`];
  }
}

function kitError(status: number, messages: readonly string[]): KitApiError {
  return {
    status,
    code: errorCodeFromStatus(status),
    messages,
  };
}

function networkError(message: string): KitApiError {
  return {
    status: 0,
    code: KIT_API_ERROR_CODE.NetworkError,
    messages: [message],
  };
}

// ---------------------------------------------------------------------------
// Generic request helpers
// ---------------------------------------------------------------------------

async function request<T>(
  config: KitClientConfig,
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Result<{ data: T; status: number }, KitApiError>> {
  const url = `${BASE_URL}${path}`;
  const startTime = Date.now();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let response: Response;
  try {
    response = await config.fetchFn(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Network error";
    kitLogger.error("kit_api_network_error", {
      method,
      endpoint: path,
      durationMs: Date.now() - startTime,
      error: message,
    });
    return err(networkError(message));
  }

  const durationMs = Date.now() - startTime;

  // Warn on approaching rate limit
  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
  if (rateLimitRemaining !== null) {
    const remaining = parseInt(rateLimitRemaining, 10);
    if (!isNaN(remaining) && remaining < 20) {
      kitLogger.warn("kit_api_rate_limit_approaching", {
        method,
        endpoint: path,
        remaining,
      });
    }
  }

  if (response.status === 204) {
    kitLogger.debug("kit_api_call", { method, endpoint: path, status: 204, durationMs });
    // 204 No Content — return empty object as T
    return ok({ data: undefined as unknown as T, status: 204 });
  }

  if (!response.ok) {
    const messages = await parseErrorBody(response);
    kitLogger.error("kit_api_error", {
      method,
      endpoint: path,
      status: response.status,
      durationMs,
      errorMessages: messages,
    });
    return err(kitError(response.status, messages));
  }

  try {
    const data = (await response.json()) as T;
    kitLogger.debug("kit_api_call", {
      method,
      endpoint: path,
      status: response.status,
      durationMs,
    });
    return ok({ data, status: response.status });
  } catch {
    kitLogger.error("kit_api_parse_error", {
      method,
      endpoint: path,
      status: response.status,
      durationMs,
    });
    return err(kitError(response.status, ["Failed to parse response JSON"]));
  }
}

// ---------------------------------------------------------------------------
// Paginated list helper
// ---------------------------------------------------------------------------

interface PaginatedResponse {
  readonly pagination: KitPagination;
  readonly [key: string]: unknown;
}

async function listAll<T>(
  config: KitClientConfig,
  accessToken: string,
  path: string,
  key: string,
): Promise<Result<readonly T[], KitApiError>> {
  const items: T[] = [];
  let cursor: string | null = null;

  for (;;) {
    const separator: string = path.includes("?") ? "&" : "?";
    const pageUrl: string = cursor
      ? `${path}${separator}after=${encodeURIComponent(cursor)}&per_page=500`
      : `${path}${separator}per_page=500`;

    const result: Result<{ data: PaginatedResponse; status: number }, KitApiError> =
      await request<PaginatedResponse>(config, accessToken, "GET", pageUrl);

    if (!result.ok) {
      return err(result.error);
    }

    const responseData: PaginatedResponse = result.value.data;
    const pageItems = responseData[key] as T[] | undefined;
    if (Array.isArray(pageItems)) {
      items.push(...pageItems);
    }

    const pagination: KitPagination = responseData.pagination;
    if (pagination.has_next_page && pagination.end_cursor) {
      cursor = pagination.end_cursor;
    } else {
      break;
    }
  }

  return ok(items);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// -- Subscribers -------------------------------------------------------------

/**
 * Get a subscriber by email address.
 * Uses the list endpoint with email_address filter as Kit V4 does not
 * provide a dedicated get-by-email endpoint.
 */
export async function getSubscriber(
  config: KitClientConfig,
  accessToken: string,
  email: string,
): Promise<Result<KitSubscriber, KitApiError>> {
  const path = `/subscribers?email_address=${encodeURIComponent(email)}`;
  const result = await request<{
    subscribers: readonly KitSubscriber[];
  }>(config, accessToken, "GET", path);

  if (!result.ok) {
    return err(result.error);
  }

  const subscribers = result.value.data.subscribers;
  if (!Array.isArray(subscribers) || subscribers.length === 0) {
    return err(kitError(404, [`Subscriber not found: ${email}`]));
  }

  const subscriber = subscribers[0];
  if (!subscriber) {
    return err(kitError(404, [`Subscriber not found: ${email}`]));
  }

  return ok(subscriber);
}

/**
 * Create a new subscriber.
 */
export async function createSubscriber(
  config: KitClientConfig,
  accessToken: string,
  email: string,
  firstName?: string | null,
  fields?: Readonly<Record<string, string>> | null,
): Promise<Result<KitSubscriber, KitApiError>> {
  const body: Record<string, unknown> = {
    email_address: email,
  };
  if (firstName !== undefined && firstName !== null) {
    body.first_name = firstName;
  }
  if (fields !== undefined && fields !== null) {
    body.fields = fields;
  }

  const result = await request<{ subscriber: KitSubscriber }>(
    config,
    accessToken,
    "POST",
    "/subscribers",
    body,
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.subscriber);
}

/**
 * Update an existing subscriber.
 */
export async function updateSubscriber(
  config: KitClientConfig,
  accessToken: string,
  id: string,
  fields: Readonly<Record<string, string>>,
): Promise<Result<KitSubscriber, KitApiError>> {
  const result = await request<{ subscriber: KitSubscriber }>(
    config,
    accessToken,
    "PUT",
    `/subscribers/${encodeURIComponent(id)}`,
    { fields },
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.subscriber);
}

/**
 * Tag a subscriber by tag ID and subscriber ID.
 */
export async function tagSubscriber(
  config: KitClientConfig,
  accessToken: string,
  subscriberId: string,
  tagId: string,
): Promise<Result<void, KitApiError>> {
  const result = await request<{ subscriber: KitSubscriber }>(
    config,
    accessToken,
    "POST",
    `/tags/${encodeURIComponent(tagId)}/subscribers/${encodeURIComponent(subscriberId)}`,
    {},
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(undefined);
}

/**
 * Remove a tag from a subscriber.
 */
export async function untagSubscriber(
  config: KitClientConfig,
  accessToken: string,
  subscriberId: string,
  tagId: string,
): Promise<Result<void, KitApiError>> {
  const result = await request<undefined>(
    config,
    accessToken,
    "DELETE",
    `/tags/${encodeURIComponent(tagId)}/subscribers/${encodeURIComponent(subscriberId)}`,
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(undefined);
}

// -- Tags -------------------------------------------------------------------

/**
 * List all tags for the account.
 */
export async function listTags(
  config: KitClientConfig,
  accessToken: string,
): Promise<Result<readonly KitTag[], KitApiError>> {
  return listAll<KitTag>(config, accessToken, "/tags", "tags");
}

/**
 * Create a new tag.
 * Kit returns 200 with existing tag if one with the same name exists.
 */
export async function createTag(
  config: KitClientConfig,
  accessToken: string,
  name: string,
): Promise<Result<KitTag, KitApiError>> {
  const result = await request<{ tag: KitTag }>(config, accessToken, "POST", "/tags", { name });

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.tag);
}

/**
 * Get or create a tag by name — idempotent.
 *
 * Kit's createTag endpoint already returns the existing tag if one with the
 * same name exists (HTTP 200 vs 201), making this operation inherently
 * idempotent.
 */
export async function getOrCreateTag(
  config: KitClientConfig,
  accessToken: string,
  name: string,
): Promise<Result<KitTag, KitApiError>> {
  return createTag(config, accessToken, name);
}

// -- Custom Fields ----------------------------------------------------------

/**
 * List all custom fields for the account.
 */
export async function listCustomFields(
  config: KitClientConfig,
  accessToken: string,
): Promise<Result<readonly KitCustomField[], KitApiError>> {
  return listAll<KitCustomField>(config, accessToken, "/custom_fields", "custom_fields");
}

/**
 * Create a custom field. Kit returns 200 with the existing field if one
 * with the same label already exists.
 */
export async function createCustomField(
  config: KitClientConfig,
  accessToken: string,
  label: string,
): Promise<Result<KitCustomField, KitApiError>> {
  const result = await request<{ custom_field: KitCustomField }>(
    config,
    accessToken,
    "POST",
    "/custom_fields",
    { label },
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.custom_field);
}

/**
 * Get or create a custom field by label — idempotent.
 *
 * Kit's createCustomField endpoint already returns the existing field if
 * the label matches (HTTP 200 vs 201), making this inherently idempotent.
 */
export async function getOrCreateCustomField(
  config: KitClientConfig,
  accessToken: string,
  _key: string,
  label: string,
): Promise<Result<KitCustomField, KitApiError>> {
  return createCustomField(config, accessToken, label);
}

// -- Broadcasts -------------------------------------------------------------

/**
 * Create a broadcast draft.
 */
export async function createBroadcastDraft(
  config: KitClientConfig,
  accessToken: string,
  params: BroadcastDraftParams,
): Promise<Result<KitBroadcast, KitApiError>> {
  const body: Record<string, unknown> = {
    subject: params.subject,
    content: params.content,
    description: params.description,
    public: false,
  };

  if (params.email_template_id !== null) {
    body.email_template_id = params.email_template_id;
  }

  if (params.subscriber_filter !== null) {
    body.subscriber_filter = params.subscriber_filter;
  }

  if (params.send_at !== null) {
    body.send_at = params.send_at;
  }

  const result = await request<{ broadcast: KitBroadcast }>(
    config,
    accessToken,
    "POST",
    "/broadcasts",
    body,
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.broadcast);
}

/**
 * Get a broadcast by ID.
 */
export async function getBroadcast(
  config: KitClientConfig,
  accessToken: string,
  id: string,
): Promise<Result<KitBroadcast, KitApiError>> {
  const result = await request<{ broadcast: KitBroadcast }>(
    config,
    accessToken,
    "GET",
    `/broadcasts/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.broadcast);
}

// -- Sequences ---------------------------------------------------------------

/**
 * List all sequences for the account.
 */
export async function listSequences(
  config: KitClientConfig,
  accessToken: string,
): Promise<Result<readonly KitSequence[], KitApiError>> {
  return listAll<KitSequence>(config, accessToken, "/sequences", "sequences");
}

/**
 * Add a subscriber to a sequence.
 */
export async function addSubscriberToSequence(
  config: KitClientConfig,
  accessToken: string,
  subscriberId: string,
  sequenceId: string,
): Promise<Result<void, KitApiError>> {
  const result = await request<{ subscriber: KitSubscriber }>(
    config,
    accessToken,
    "POST",
    `/sequences/${encodeURIComponent(sequenceId)}/subscribers/${encodeURIComponent(subscriberId)}`,
    {},
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(undefined);
}

// -- Forms -------------------------------------------------------------------

/**
 * List all forms for the account.
 */
export async function listForms(
  config: KitClientConfig,
  accessToken: string,
): Promise<Result<readonly KitForm[], KitApiError>> {
  return listAll<KitForm>(config, accessToken, "/forms", "forms");
}

/**
 * Add a subscriber to a form.
 *
 * Note: Kit does not have a "create form" API endpoint. Forms are created
 * through the Kit UI. This method adds a subscriber to an existing form.
 */
export async function addSubscriberToForm(
  config: KitClientConfig,
  accessToken: string,
  formId: string,
  subscriberId: string,
): Promise<Result<void, KitApiError>> {
  const result = await request<{ subscriber: KitSubscriber }>(
    config,
    accessToken,
    "POST",
    `/forms/${encodeURIComponent(formId)}/subscribers/${encodeURIComponent(subscriberId)}`,
    {},
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(undefined);
}

// -- Purchases ---------------------------------------------------------------

/**
 * Create a purchase record.
 */
export async function createPurchase(
  config: KitClientConfig,
  accessToken: string,
  params: KitPurchaseParams,
): Promise<Result<KitPurchase, KitApiError>> {
  const result = await request<{ purchase: KitPurchase }>(
    config,
    accessToken,
    "POST",
    "/purchases",
    { purchase: params },
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.purchase);
}

// -- Webhooks ----------------------------------------------------------------

/**
 * Register a webhook.
 */
export async function registerWebhook(
  config: KitClientConfig,
  accessToken: string,
  event: KitWebhookRegistrationEvent,
  targetUrl: string,
): Promise<Result<KitWebhook, KitApiError>> {
  const result = await request<{ webhook: KitWebhook }>(config, accessToken, "POST", "/webhooks", {
    target_url: targetUrl,
    event,
  });

  if (!result.ok) {
    return err(result.error);
  }

  return ok(result.value.data.webhook);
}

/**
 * List all webhooks for the account.
 */
export async function listWebhooks(
  config: KitClientConfig,
  accessToken: string,
): Promise<Result<readonly KitWebhook[], KitApiError>> {
  return listAll<KitWebhook>(config, accessToken, "/webhooks", "webhooks");
}

/**
 * Delete a webhook by ID.
 */
export async function deleteWebhook(
  config: KitClientConfig,
  accessToken: string,
  id: string,
): Promise<Result<void, KitApiError>> {
  const result = await request<undefined>(
    config,
    accessToken,
    "DELETE",
    `/webhooks/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    return err(result.error);
  }

  return ok(undefined);
}
