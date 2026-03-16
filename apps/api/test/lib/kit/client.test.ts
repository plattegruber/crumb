// ---------------------------------------------------------------------------
// Tests for Kit V4 API client
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
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
} from "../../../src/lib/kit/client.js";
import type { KitClientConfig } from "../../../src/lib/kit/client.js";
import type { BroadcastDraftParams, KitPurchaseParams } from "../../../src/lib/kit/types.js";

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): KitClientConfig {
  return {
    fetchFn: handler as typeof globalThis.fetch,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(messages: string[], status: number): Response {
  return jsonResponse({ errors: messages }, status);
}

const TOKEN = "test-access-token";

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------

describe("Kit Client — Subscribers", () => {
  describe("getSubscriber", () => {
    it("returns subscriber when found", async () => {
      const subscriber = {
        id: 1,
        first_name: "Alice",
        email_address: "alice@example.com",
        state: "active",
        created_at: "2024-01-01T00:00:00Z",
        fields: {},
      };

      const config = mockFetch(async () => jsonResponse({ subscribers: [subscriber] }));

      const result = await getSubscriber(config, TOKEN, "alice@example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email_address).toBe("alice@example.com");
        expect(result.value.first_name).toBe("Alice");
      }
    });

    it("returns not found error when subscriber does not exist", async () => {
      const config = mockFetch(async () => jsonResponse({ subscribers: [] }));

      const result = await getSubscriber(config, TOKEN, "nobody@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
        expect(result.error.code).toBe("not_found");
      }
    });

    it("returns error on 401", async () => {
      const config = mockFetch(async () => errorResponse(["The access token is invalid"], 401));

      const result = await getSubscriber(config, TOKEN, "alice@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("unauthorized");
      }
    });
  });

  describe("createSubscriber", () => {
    it("creates a subscriber successfully", async () => {
      const subscriber = {
        id: 2,
        first_name: "Bob",
        email_address: "bob@example.com",
        state: "active",
        created_at: "2024-01-02T00:00:00Z",
        fields: {},
      };

      const config = mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        expect(body.email_address).toBe("bob@example.com");
        expect(body.first_name).toBe("Bob");
        return jsonResponse({ subscriber }, 201);
      });

      const result = await createSubscriber(config, TOKEN, "bob@example.com", "Bob");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.email_address).toBe("bob@example.com");
      }
    });

    it("creates subscriber with custom fields", async () => {
      const subscriber = {
        id: 3,
        first_name: null,
        email_address: "carol@example.com",
        state: "active",
        created_at: "2024-01-03T00:00:00Z",
        fields: { category: "food" },
      };

      const config = mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        expect(body.fields).toEqual({ category: "food" });
        return jsonResponse({ subscriber }, 201);
      });

      const result = await createSubscriber(config, TOKEN, "carol@example.com", null, {
        category: "food",
      });
      expect(result.ok).toBe(true);
    });

    it("returns validation error on 422", async () => {
      const config = mockFetch(async () => errorResponse(["Email address is invalid"], 422));

      const result = await createSubscriber(config, TOKEN, "invalid");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
    });
  });

  describe("updateSubscriber", () => {
    it("updates subscriber fields", async () => {
      const subscriber = {
        id: 1,
        first_name: "Alice",
        email_address: "alice@example.com",
        state: "active",
        created_at: "2024-01-01T00:00:00Z",
        fields: { last_recipe_saved: "lemon-pasta" },
      };

      const config = mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        expect(body.fields).toEqual({ last_recipe_saved: "lemon-pasta" });
        return jsonResponse({ subscriber });
      });

      const result = await updateSubscriber(config, TOKEN, "1", {
        last_recipe_saved: "lemon-pasta",
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("tagSubscriber", () => {
    it("tags a subscriber", async () => {
      const config = mockFetch(async (url) => {
        expect(url).toContain("/tags/10/subscribers/1");
        return jsonResponse(
          {
            subscriber: {
              id: 1,
              first_name: null,
              email_address: "a@b.com",
              state: "active",
              created_at: "2024-01-01T00:00:00Z",
              tagged_at: "2024-01-02T00:00:00Z",
              fields: {},
            },
          },
          201,
        );
      });

      const result = await tagSubscriber(config, TOKEN, "1", "10");
      expect(result.ok).toBe(true);
    });

    it("returns error on 404", async () => {
      const config = mockFetch(async () => errorResponse(["Not Found"], 404));

      const result = await tagSubscriber(config, TOKEN, "999", "10");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_found");
      }
    });
  });

  describe("untagSubscriber", () => {
    it("removes a tag from a subscriber", async () => {
      const config = mockFetch(async (url, init) => {
        expect(url).toContain("/tags/10/subscribers/1");
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      });

      const result = await untagSubscriber(config, TOKEN, "1", "10");
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe("Kit Client — Tags", () => {
  describe("listTags", () => {
    it("returns all tags across pages", async () => {
      let callCount = 0;
      const config = mockFetch(async (url) => {
        callCount++;
        if (callCount === 1) {
          expect(url).not.toContain("after=");
          return jsonResponse({
            tags: [{ id: 1, name: "dietary:vegan", created_at: "2024-01-01T00:00:00Z" }],
            pagination: {
              has_previous_page: false,
              has_next_page: true,
              start_cursor: "s1",
              end_cursor: "e1",
              per_page: 500,
            },
          });
        }
        expect(url).toContain("after=e1");
        return jsonResponse({
          tags: [{ id: 2, name: "dietary:keto", created_at: "2024-01-02T00:00:00Z" }],
          pagination: {
            has_previous_page: true,
            has_next_page: false,
            start_cursor: "s2",
            end_cursor: "e2",
            per_page: 500,
          },
        });
      });

      const result = await listTags(config, TOKEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.name).toBe("dietary:vegan");
        expect(result.value[1]?.name).toBe("dietary:keto");
      }
    });
  });

  describe("createTag", () => {
    it("creates a new tag", async () => {
      const config = mockFetch(async () =>
        jsonResponse(
          { tag: { id: 5, name: "dietary:vegan", created_at: "2024-01-01T00:00:00Z" } },
          201,
        ),
      );

      const result = await createTag(config, TOKEN, "dietary:vegan");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("dietary:vegan");
      }
    });

    it("returns existing tag on 200", async () => {
      const config = mockFetch(async () =>
        jsonResponse(
          { tag: { id: 5, name: "dietary:vegan", created_at: "2024-01-01T00:00:00Z" } },
          200,
        ),
      );

      const result = await createTag(config, TOKEN, "dietary:vegan");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(5);
      }
    });
  });

  describe("getOrCreateTag", () => {
    it("is idempotent — returns existing tag", async () => {
      const config = mockFetch(async () =>
        jsonResponse(
          { tag: { id: 5, name: "dietary:vegan", created_at: "2024-01-01T00:00:00Z" } },
          200,
        ),
      );

      const result = await getOrCreateTag(config, TOKEN, "dietary:vegan");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("dietary:vegan");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Custom Fields
// ---------------------------------------------------------------------------

describe("Kit Client — Custom Fields", () => {
  describe("listCustomFields", () => {
    it("returns all custom fields", async () => {
      const config = mockFetch(async () =>
        jsonResponse({
          custom_fields: [
            {
              id: 1,
              name: "ck_field_1_preferred",
              key: "preferred_dietary_tags",
              label: "preferred_dietary_tags",
            },
          ],
          pagination: {
            has_previous_page: false,
            has_next_page: false,
            start_cursor: "s1",
            end_cursor: "e1",
            per_page: 500,
          },
        }),
      );

      const result = await listCustomFields(config, TOKEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.key).toBe("preferred_dietary_tags");
      }
    });
  });

  describe("createCustomField", () => {
    it("creates a new custom field", async () => {
      const config = mockFetch(async () =>
        jsonResponse(
          {
            custom_field: {
              id: 10,
              name: "ck_field_10_last_recipe_saved",
              key: "last_recipe_saved",
              label: "last_recipe_saved",
            },
          },
          201,
        ),
      );

      const result = await createCustomField(config, TOKEN, "last_recipe_saved");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.label).toBe("last_recipe_saved");
      }
    });
  });

  describe("getOrCreateCustomField", () => {
    it("returns existing custom field on 200", async () => {
      const config = mockFetch(async () =>
        jsonResponse({
          custom_field: {
            id: 10,
            name: "ck_field_10_last_recipe_saved",
            key: "last_recipe_saved",
            label: "last_recipe_saved",
          },
        }),
      );

      const result = await getOrCreateCustomField(
        config,
        TOKEN,
        "last_recipe_saved",
        "last_recipe_saved",
      );
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

describe("Kit Client — Broadcasts", () => {
  describe("createBroadcastDraft", () => {
    it("creates a broadcast draft", async () => {
      const broadcast = {
        id: 100,
        created_at: "2024-01-01T00:00:00Z",
        subject: "New Recipe!",
        preview_text: null,
        description: "Weekly recipe",
        content: "<h1>Recipe</h1>",
        public: false,
        published_at: null,
        send_at: null,
        thumbnail_alt: null,
        thumbnail_url: null,
        email_address: null,
        email_template: null,
      };

      const config = mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        expect(body.subject).toBe("New Recipe!");
        expect(body.content).toBe("<h1>Recipe</h1>");
        return jsonResponse({ broadcast }, 201);
      });

      const params: BroadcastDraftParams = {
        subject: "New Recipe!",
        content: "<h1>Recipe</h1>",
        description: "Weekly recipe",
        email_template_id: null,
        subscriber_filter: null,
        send_at: null,
      };

      const result = await createBroadcastDraft(config, TOKEN, params);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.subject).toBe("New Recipe!");
      }
    });
  });

  describe("getBroadcast", () => {
    it("returns a broadcast by ID", async () => {
      const broadcast = {
        id: 100,
        created_at: "2024-01-01T00:00:00Z",
        subject: "Test",
        preview_text: null,
        description: null,
        content: "<p>Hello</p>",
        public: false,
        published_at: null,
        send_at: null,
        thumbnail_alt: null,
        thumbnail_url: null,
        email_address: null,
        email_template: null,
      };

      const config = mockFetch(async (url) => {
        expect(url).toContain("/broadcasts/100");
        return jsonResponse({ broadcast });
      });

      const result = await getBroadcast(config, TOKEN, "100");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(100);
      }
    });

    it("returns not found on 404", async () => {
      const config = mockFetch(async () => errorResponse(["Not Found"], 404));

      const result = await getBroadcast(config, TOKEN, "999");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_found");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

describe("Kit Client — Sequences", () => {
  describe("listSequences", () => {
    it("returns all sequences", async () => {
      const config = mockFetch(async () =>
        jsonResponse({
          sequences: [
            {
              id: 1,
              name: "Welcome",
              hold: false,
              repeat: false,
              created_at: "2024-01-01T00:00:00Z",
            },
          ],
          pagination: {
            has_previous_page: false,
            has_next_page: false,
            start_cursor: "s1",
            end_cursor: "e1",
            per_page: 500,
          },
        }),
      );

      const result = await listSequences(config, TOKEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.name).toBe("Welcome");
      }
    });
  });

  describe("addSubscriberToSequence", () => {
    it("adds subscriber to sequence", async () => {
      const config = mockFetch(async (url) => {
        expect(url).toContain("/sequences/66/subscribers/881");
        return jsonResponse(
          {
            subscriber: {
              id: 881,
              first_name: null,
              email_address: "a@b.com",
              state: "active",
              created_at: "2024-01-01T00:00:00Z",
              added_at: "2024-01-02T00:00:00Z",
              fields: {},
            },
          },
          201,
        );
      });

      const result = await addSubscriberToSequence(config, TOKEN, "881", "66");
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

describe("Kit Client — Forms", () => {
  describe("listForms", () => {
    it("returns all forms", async () => {
      const config = mockFetch(async () =>
        jsonResponse({
          forms: [
            {
              id: 1,
              name: "Sign Up",
              created_at: "2024-01-01T00:00:00Z",
              type: "embed",
              format: null,
              embed_js: "https://example.com/embed.js",
              embed_url: "https://example.com/embed",
              archived: false,
              uid: "abc123",
            },
          ],
          pagination: {
            has_previous_page: false,
            has_next_page: false,
            start_cursor: "s1",
            end_cursor: "e1",
            per_page: 500,
          },
        }),
      );

      const result = await listForms(config, TOKEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.name).toBe("Sign Up");
      }
    });
  });

  describe("addSubscriberToForm", () => {
    it("adds subscriber to form", async () => {
      const config = mockFetch(async (url) => {
        expect(url).toContain("/forms/190/subscribers/668");
        return jsonResponse(
          {
            subscriber: {
              id: 668,
              first_name: null,
              email_address: "test@example.com",
              state: "active",
              created_at: "2024-01-01T00:00:00Z",
              added_at: "2024-01-02T00:00:00Z",
              fields: {},
            },
          },
          201,
        );
      });

      const result = await addSubscriberToForm(config, TOKEN, "190", "668");
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

describe("Kit Client — Purchases", () => {
  describe("createPurchase", () => {
    it("creates a purchase", async () => {
      const purchase = {
        id: 1,
        subscriber_id: 100,
        transaction_id: "txn_123",
        status: "paid",
        email_address: "buyer@example.com",
        currency: "USD",
        transaction_time: "2024-01-01T00:00:00Z",
        subtotal: 29.99,
        discount: 0,
        tax: 2.4,
        total: 32.39,
        products: [
          { name: "Ebook", pid: "p1", lid: "l1", quantity: 1, unit_price: 29.99, sku: "SKU1" },
        ],
      };

      const config = mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        expect(body.purchase).toBeDefined();
        return jsonResponse({ purchase }, 201);
      });

      const params: KitPurchaseParams = {
        email_address: "buyer@example.com",
        transaction_id: "txn_123",
        status: "paid",
        subtotal: 29.99,
        tax: 2.4,
        discount: 0,
        total: 32.39,
        shipping: 0,
        currency: "USD",
        transaction_time: "2024-01-01T00:00:00Z",
        products: [
          { name: "Ebook", pid: "p1", lid: "l1", quantity: 1, unit_price: 29.99, sku: "SKU1" },
        ],
      };

      const result = await createPurchase(config, TOKEN, params);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.transaction_id).toBe("txn_123");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

describe("Kit Client — Webhooks", () => {
  describe("registerWebhook", () => {
    it("registers a webhook", async () => {
      const webhook = {
        id: 30,
        account_id: 1,
        event: { name: "subscriber_activate", initiator_value: null },
        target_url: "https://app.example.com/webhooks/kit",
      };

      const config = mockFetch(async (_url, init) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        expect(body.target_url).toBe("https://app.example.com/webhooks/kit");
        return jsonResponse({ webhook }, 201);
      });

      const result = await registerWebhook(
        config,
        TOKEN,
        { name: "subscriber_activate" },
        "https://app.example.com/webhooks/kit",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(30);
      }
    });
  });

  describe("listWebhooks", () => {
    it("returns all webhooks", async () => {
      const config = mockFetch(async () =>
        jsonResponse({
          webhooks: [
            {
              id: 30,
              account_id: 1,
              event: { name: "subscriber_activate" },
              target_url: "https://app.example.com/webhooks/kit",
            },
          ],
          pagination: {
            has_previous_page: false,
            has_next_page: false,
            start_cursor: "s1",
            end_cursor: "e1",
            per_page: 500,
          },
        }),
      );

      const result = await listWebhooks(config, TOKEN);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });
  });

  describe("deleteWebhook", () => {
    it("deletes a webhook", async () => {
      const config = mockFetch(async (url, init) => {
        expect(url).toContain("/webhooks/30");
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      });

      const result = await deleteWebhook(config, TOKEN, "30");
      expect(result.ok).toBe(true);
    });

    it("returns not found on 404", async () => {
      const config = mockFetch(async () => errorResponse(["Not Found"], 404));

      const result = await deleteWebhook(config, TOKEN, "999");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_found");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Network errors
// ---------------------------------------------------------------------------

describe("Kit Client — Network errors", () => {
  it("returns network error when fetch throws", async () => {
    const config = mockFetch(async () => {
      throw new Error("Connection refused");
    });

    const result = await getSubscriber(config, TOKEN, "test@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network_error");
      expect(result.error.status).toBe(0);
      expect(result.error.messages[0]).toBe("Connection refused");
    }
  });
});

// ---------------------------------------------------------------------------
// Rate limiting response
// ---------------------------------------------------------------------------

describe("Kit Client — Rate limiting", () => {
  it("returns rate_limited error on 429", async () => {
    const config = mockFetch(async () => errorResponse(["Rate limit exceeded"], 429));

    const result = await listTags(config, TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limited");
    }
  });
});

// ---------------------------------------------------------------------------
// Server errors
// ---------------------------------------------------------------------------

describe("Kit Client — Server errors", () => {
  it("returns server_error on 500", async () => {
    const config = mockFetch(async () => errorResponse(["Internal server error"], 500));

    const result = await listTags(config, TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("server_error");
    }
  });
});
