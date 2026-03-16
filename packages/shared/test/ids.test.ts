import { describe, it, expect } from "vitest";
import {
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
} from "../src/ids.js";

describe("branded ID factory functions", () => {
  it("creates a CreatorId from a string", () => {
    const id = createCreatorId("abc-123");
    expect(id).toBe("abc-123");
    // At runtime it's still a string
    expect(typeof id).toBe("string");
  });

  it("creates a RecipeId from a string", () => {
    const id = createRecipeId("recipe-1");
    expect(id).toBe("recipe-1");
  });

  it("creates all UUID-based IDs", () => {
    expect(createCollectionId("c")).toBe("c");
    expect(createProductId("p")).toBe("p");
    expect(createBrandKitId("b")).toBe("b");
    expect(createImportJobId("i")).toBe("i");
    expect(createPhotoId("ph")).toBe("ph");
    expect(createIngredientId("ing")).toBe("ing");
    expect(createInstructionId("ins")).toBe("ins");
    expect(createTeamMemberId("tm")).toBe("tm");
    expect(createEventId("e")).toBe("e");
  });

  it("creates Kit opaque identifiers", () => {
    expect(createKitAccountId("ka")).toBe("ka");
    expect(createKitTagId("kt")).toBe("kt");
    expect(createKitFormId("kf")).toBe("kf");
    expect(createKitSequenceId("ks")).toBe("ks");
    expect(createKitBroadcastId("kb")).toBe("kb");
    expect(createKitSubscriberId("ksu")).toBe("ksu");
  });

  it("branded IDs preserve their string value", () => {
    const creatorId = createCreatorId("same-uuid");
    const recipeId = createRecipeId("same-uuid");
    // At runtime they are equal strings, but at the type level they differ.
    // This test confirms factory functions return the original value.
    expect(creatorId).toBe("same-uuid");
    expect(recipeId).toBe("same-uuid");
    // Both are strings at runtime
    expect(typeof creatorId).toBe("string");
    expect(typeof recipeId).toBe("string");
  });
});

describe("Url validation", () => {
  it("accepts a valid http URL", () => {
    const url = createUrl("http://example.com");
    expect(url).toBe("http://example.com");
  });

  it("accepts a valid https URL", () => {
    const url = createUrl("https://example.com/path?q=1");
    expect(url).toBe("https://example.com/path?q=1");
  });

  it("rejects a URL without a scheme", () => {
    expect(createUrl("example.com")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(createUrl("")).toBeNull();
  });

  it("rejects a relative path", () => {
    expect(createUrl("/foo/bar")).toBeNull();
  });

  it("rejects ftp scheme", () => {
    expect(createUrl("ftp://example.com")).toBeNull();
  });
});

describe("HexColor validation", () => {
  it("accepts a valid hex color", () => {
    expect(createHexColor("#FF00AA")).toBe("#FF00AA");
  });

  it("accepts lowercase hex", () => {
    expect(createHexColor("#abcdef")).toBe("#abcdef");
  });

  it("rejects missing hash", () => {
    expect(createHexColor("FF00AA")).toBeNull();
  });

  it("rejects short hex (3-digit)", () => {
    expect(createHexColor("#FFF")).toBeNull();
  });

  it("rejects too many digits", () => {
    expect(createHexColor("#FF00AA00")).toBeNull();
  });

  it("rejects invalid characters", () => {
    expect(createHexColor("#GGHHII")).toBeNull();
  });
});

describe("Slug validation", () => {
  it("accepts a valid slug", () => {
    expect(createSlug("lemon-pasta")).toBe("lemon-pasta");
  });

  it("accepts a single word slug", () => {
    expect(createSlug("pasta")).toBe("pasta");
  });

  it("accepts slug with numbers", () => {
    expect(createSlug("recipe-42")).toBe("recipe-42");
  });

  it("rejects uppercase letters", () => {
    expect(createSlug("Lemon-Pasta")).toBeNull();
  });

  it("rejects spaces", () => {
    expect(createSlug("lemon pasta")).toBeNull();
  });

  it("rejects leading hyphen", () => {
    expect(createSlug("-lemon")).toBeNull();
  });

  it("rejects trailing hyphen", () => {
    expect(createSlug("lemon-")).toBeNull();
  });

  it("rejects consecutive hyphens", () => {
    expect(createSlug("lemon--pasta")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(createSlug("")).toBeNull();
  });
});
