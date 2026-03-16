import { describe, it, expect } from "vitest";
import { generateSaveUrl, renderSaveButton } from "@/lib/cta-generator";
import type { CreatorId, HexColor, Slug } from "@crumb/shared";

// ---------------------------------------------------------------------------
// generateSaveUrl tests
// ---------------------------------------------------------------------------

describe("generateSaveUrl", () => {
  it("generates URL matching spec format", () => {
    const url = generateSaveUrl({
      appDomain: "crumb.cooking",
      creatorId: "creator-123" as CreatorId,
      recipeSlug: "lemon-pasta" as Slug,
    });

    expect(url).toBe(
      "https://app.crumb.cooking/save/creator-123/lemon-pasta?ck={{subscriber.id}}",
    );
  });

  it("includes subscriber variable placeholder", () => {
    const url = generateSaveUrl({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "test-recipe" as Slug,
    });

    expect(url).toContain("{{subscriber.id}}");
  });

  it("uses Kit subscriber variable syntax for ck parameter", () => {
    const url = generateSaveUrl({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "test-recipe" as Slug,
    });

    expect(url).toContain("?ck={{subscriber.id}}");
  });

  it("includes https protocol with app subdomain", () => {
    const url = generateSaveUrl({
      appDomain: "mysite.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "recipe-1" as Slug,
    });

    expect(url).toMatch(/^https:\/\/app\./);
  });

  it("includes creator_id in path", () => {
    const url = generateSaveUrl({
      appDomain: "example.com",
      creatorId: "abc-def-123" as CreatorId,
      recipeSlug: "my-recipe" as Slug,
    });

    expect(url).toContain("/save/abc-def-123/");
  });

  it("includes recipe_slug in path", () => {
    const url = generateSaveUrl({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "chocolate-chip-cookies" as Slug,
    });

    expect(url).toContain("/chocolate-chip-cookies?");
  });

  it("handles different domain formats", () => {
    const url = generateSaveUrl({
      appDomain: "sub.domain.co.uk",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "recipe" as Slug,
    });

    expect(url).toBe(
      "https://app.sub.domain.co.uk/save/c-1/recipe?ck={{subscriber.id}}",
    );
  });
});

// ---------------------------------------------------------------------------
// renderSaveButton tests
// ---------------------------------------------------------------------------

describe("renderSaveButton", () => {
  it("renders a table-based button", () => {
    const html = renderSaveButton({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "test" as Slug,
      primaryColor: "#E85D04" as HexColor,
      bodyFont: "Arial",
    });

    expect(html).toContain('<table role="presentation"');
    expect(html).toContain("Save This Recipe");
    expect(html).toContain("<a ");
  });

  it("includes the tracked URL in the button link", () => {
    const html = renderSaveButton({
      appDomain: "crumb.cooking",
      creatorId: "creator-1" as CreatorId,
      recipeSlug: "pasta" as Slug,
      primaryColor: "#FF0000" as HexColor,
      bodyFont: "Arial",
    });

    expect(html).toContain(
      "https://app.crumb.cooking/save/creator-1/pasta?ck={{subscriber.id}}",
    );
  });

  it("applies primary color to button background", () => {
    const html = renderSaveButton({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "test" as Slug,
      primaryColor: "#3B82F6" as HexColor,
      bodyFont: "Arial",
    });

    expect(html).toContain("background-color:#3B82F6");
  });

  it("uses white text color for contrast", () => {
    const html = renderSaveButton({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "test" as Slug,
      primaryColor: "#000000" as HexColor,
      bodyFont: "Arial",
    });

    expect(html).toContain("color:#FFFFFF");
  });

  it("uses inline styles only", () => {
    const html = renderSaveButton({
      appDomain: "example.com",
      creatorId: "c-1" as CreatorId,
      recipeSlug: "test" as Slug,
      primaryColor: "#000000" as HexColor,
      bodyFont: "Arial",
    });

    expect(html).toContain('style="');
    expect(html).not.toContain("<style");
  });
});
