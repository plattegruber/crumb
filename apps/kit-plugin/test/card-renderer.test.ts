import { describe, it, expect } from "vitest";
import { renderCard } from "@/lib/card-renderer";
import type { CardRenderOptions } from "@/lib/types";
import { DISPLAY_MODE } from "@/lib/types";
import {
  pluginRecipe,
  brandKit,
  ingredientGroup,
  instructionGroup,
  classification,
  hexColor,
} from "./helpers";
import { DIETARY_TAG } from "@dough/shared";

// ---------------------------------------------------------------------------
// Shared options factories
// ---------------------------------------------------------------------------

function compactOptions(): CardRenderOptions {
  return {
    displayMode: DISPLAY_MODE.Compact,
    showNutrition: false,
    appDomain: "example.com",
  };
}

function standardOptions(): CardRenderOptions {
  return {
    displayMode: DISPLAY_MODE.Standard,
    showNutrition: false,
    appDomain: "example.com",
  };
}

function fullOptions(showNutrition = true): CardRenderOptions {
  return {
    displayMode: DISPLAY_MODE.Full,
    showNutrition,
    appDomain: "example.com",
  };
}

// ---------------------------------------------------------------------------
// Compact mode tests
// ---------------------------------------------------------------------------

describe("renderCard — Compact mode", () => {
  it("renders correct structure with photo, title, badges, and CTA", () => {
    const recipe = pluginRecipe();
    const brand = brandKit();
    const html = renderCard(recipe, compactOptions(), brand);

    // Photo present
    expect(html).toContain("<img ");
    expect(html).toContain("recipe-photo.jpg");

    // Title present
    expect(html).toContain("Lemon Garlic Pasta");

    // Cook time badge
    expect(html).toContain("30 min");

    // Servings badge
    expect(html).toContain("4 servings");

    // Save This Recipe button
    expect(html).toContain("Save This Recipe");
  });

  it("does not render ingredients list", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("Ingredients");
  });

  it("does not render instructions", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("Instructions");
  });

  it("does not render description", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("bright and zesty");
  });

  it("does not render nutrition", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("Nutrition");
    expect(html).not.toContain("Calories");
  });

  it("uses max-height 200px for photo", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).toContain("max-height:200px");
  });

  it("uses 22px title font size", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).toContain("font-size:22px");
  });
});

// ---------------------------------------------------------------------------
// Standard mode tests
// ---------------------------------------------------------------------------

describe("renderCard — Standard mode", () => {
  it("renders max 8 ingredients with '+ N more' for overflow", () => {
    const recipe = pluginRecipe({
      ingredients: [
        ingredientGroup([
          "spaghetti",
          "lemon",
          "garlic",
          "olive oil",
          "parmesan",
          "butter",
          "salt",
          "pepper",
          "red pepper flakes",
          "parsley",
          "basil",
          "thyme",
        ]),
      ],
    });

    const html = renderCard(recipe, standardOptions(), null);

    // Should contain "Ingredients" heading
    expect(html).toContain("Ingredients");

    // Should show "+ 4 more" (12 - 8 = 4)
    expect(html).toContain("+ 4 more");
  });

  it("shows exactly 8 ingredients when recipe has exactly 8", () => {
    const recipe = pluginRecipe({
      ingredients: [
        ingredientGroup(["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8"]),
      ],
    });

    const html = renderCard(recipe, standardOptions(), null);

    expect(html).toContain("Ingredients");
    expect(html).not.toContain("+ ");
  });

  it("renders description with truncation styling", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).toContain("bright and zesty");
    expect(html).toContain("-webkit-line-clamp:2");
  });

  it("renders dietary icons", () => {
    const recipe = pluginRecipe({
      classification: classification([DIETARY_TAG.Vegetarian, DIETARY_TAG.GlutenFree]),
    });

    const html = renderCard(recipe, standardOptions(), null);

    // Should contain dietary badge abbreviations
    expect(html).toContain("GF");
    expect(html).toContain("V");
  });

  it("uses max-height 280px for photo", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).toContain("max-height:280px");
  });

  it("does not render instructions", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).not.toContain("Instructions");
  });

  it("does not render nutrition", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).not.toContain("Nutrition");
  });
});

// ---------------------------------------------------------------------------
// Full mode tests
// ---------------------------------------------------------------------------

describe("renderCard — Full mode", () => {
  it("renders all sections present", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain("Lemon Garlic Pasta");
    expect(html).toContain("bright and zesty");
    expect(html).toContain("Ingredients");
    expect(html).toContain("Instructions");
    expect(html).toContain("Nutrition");
    expect(html).toContain("Save This Recipe");
  });

  it("renders complete ingredients list without truncation", () => {
    const recipe = pluginRecipe({
      ingredients: [
        ingredientGroup([
          "item1",
          "item2",
          "item3",
          "item4",
          "item5",
          "item6",
          "item7",
          "item8",
          "item9",
          "item10",
        ]),
      ],
    });

    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain("item10");
    expect(html).not.toContain("+ ");
  });

  it("renders complete numbered instructions", () => {
    const recipe = pluginRecipe({
      instructions: [instructionGroup(["Step one.", "Step two.", "Step three."])],
    });

    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain("<ol");
    expect(html).toContain("Step one.");
    expect(html).toContain("Step two.");
    expect(html).toContain("Step three.");
  });

  it("renders nutrition summary when enabled", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(true), null);

    expect(html).toContain("Nutrition");
    expect(html).toContain("350");
    expect(html).toContain("Calories");
    expect(html).toContain("18g");
    expect(html).toContain("Protein");
    expect(html).toContain("42g");
    expect(html).toContain("Carbs");
    expect(html).toContain("12g");
    expect(html).toContain("Fat");
  });

  it("does not render nutrition when disabled", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(false), null);

    expect(html).not.toContain("Nutrition");
    expect(html).not.toContain("Calories");
  });

  it("uses max-height 320px for photo", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain("max-height:320px");
  });

  it("uses 24px title font size", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain("font-size:24px");
  });

  it("renders description without truncation styling", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain("bright and zesty");
    // Full mode should not have line-clamp truncation
    const descriptionSection = html.split("bright and zesty")[0] ?? "";
    const lastTdIndex = descriptionSection.lastIndexOf("<td");
    const tdToContent = descriptionSection.substring(lastTdIndex);
    expect(tdToContent).not.toContain("-webkit-line-clamp");
  });
});

// ---------------------------------------------------------------------------
// Email HTML constraint tests
// ---------------------------------------------------------------------------

describe("renderCard — email HTML constraints", () => {
  it("does not contain <style> blocks", () => {
    const recipe = pluginRecipe();

    for (const mode of [DISPLAY_MODE.Compact, DISPLAY_MODE.Standard, DISPLAY_MODE.Full] as const) {
      const html = renderCard(
        recipe,
        { displayMode: mode, showNutrition: true, appDomain: "example.com" },
        null,
      );
      expect(html).not.toContain("<style");
      expect(html).not.toContain("</style>");
    }
  });

  it("does not contain <script> tags", () => {
    const recipe = pluginRecipe();

    for (const mode of [DISPLAY_MODE.Compact, DISPLAY_MODE.Standard, DISPLAY_MODE.Full] as const) {
      const html = renderCard(
        recipe,
        { displayMode: mode, showNutrition: true, appDomain: "example.com" },
        null,
      );
      expect(html).not.toContain("<script");
      expect(html).not.toContain("</script>");
    }
  });

  it("has max-width 600px on container", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).toContain("max-width:600px");
  });

  it("images have explicit width and height attributes", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    // Find img tags and verify they have width and height
    const imgMatch = html.match(/<img[^>]*>/);
    expect(imgMatch).not.toBeNull();

    const imgTag = imgMatch?.[0] ?? "";
    expect(imgTag).toMatch(/width="\d+"/);
    expect(imgTag).toMatch(/height="\d+"/);
  });

  it("all styles are inline (no class attributes on styled elements)", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(), null);

    // The card should use style attributes throughout
    expect(html).toContain('style="');

    // Should not have class-based styling
    expect(html).not.toMatch(/class="[^"]*"/);
  });

  it("uses table-based layout", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, fullOptions(), null);

    expect(html).toContain('<table role="presentation"');
    expect(html).toContain("<tr>");
    expect(html).toContain("<td ");
  });
});

// ---------------------------------------------------------------------------
// Brand application tests
// ---------------------------------------------------------------------------

describe("renderCard — brand application", () => {
  it("applies brand primary_color to button background", () => {
    const recipe = pluginRecipe();
    const brand = brandKit({ primary_color: hexColor("#E85D04") });
    const html = renderCard(recipe, compactOptions(), brand);

    expect(html).toContain("background-color:#E85D04");
  });

  it("applies brand primary_color to heading color", () => {
    const recipe = pluginRecipe();
    const brand = brandKit({ primary_color: hexColor("#E85D04") });
    const html = renderCard(recipe, compactOptions(), brand);

    expect(html).toContain("color:#E85D04");
  });

  it("applies brand heading_font to title", () => {
    const recipe = pluginRecipe();
    const brand = brandKit({
      heading_font: {
        family: "Playfair Display",
        fallback: ["Georgia", "serif"],
      },
    });
    const html = renderCard(recipe, compactOptions(), brand);

    expect(html).toContain("'Playfair Display'");
  });

  it("applies brand body_font to body text", () => {
    const recipe = pluginRecipe();
    const brand = brandKit({
      body_font: {
        family: "Inter",
        fallback: ["Arial", "sans-serif"],
      },
    });
    const html = renderCard(recipe, standardOptions(), brand);

    expect(html).toContain("Inter");
  });

  it("uses default Georgia for heading when no brand", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).toContain("Georgia");
  });

  it("uses default Arial for body when no brand", () => {
    const recipe = pluginRecipe();
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).toContain("Arial");
  });

  it("font fallbacks are present", () => {
    const recipe = pluginRecipe();
    const brand = brandKit({
      heading_font: {
        family: "Playfair Display",
        fallback: ["Georgia", "serif"],
      },
      body_font: {
        family: "Inter",
        fallback: ["Arial", "sans-serif"],
      },
    });
    const html = renderCard(recipe, fullOptions(), brand);

    // Heading fallbacks
    expect(html).toContain("Georgia");
    expect(html).toContain("serif");

    // Body fallbacks
    expect(html).toContain("Arial");
    expect(html).toContain("sans-serif");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("renderCard — edge cases", () => {
  it("renders without photos", () => {
    const recipe = pluginRecipe({ photos: [] });
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("<img");
    expect(html).toContain("Lemon Garlic Pasta");
  });

  it("renders without description", () => {
    const recipe = pluginRecipe({ description: null });
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).toContain("Lemon Garlic Pasta");
  });

  it("renders without cook time", () => {
    const recipe = pluginRecipe({
      timing: { prep_minutes: null, cook_minutes: null, total_minutes: null },
    });
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("min");
  });

  it("renders without yield", () => {
    const recipe = pluginRecipe({ yield: null });
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("servings");
  });

  it("renders without nutrition data", () => {
    const recipe = pluginRecipe({ nutrition: null });
    const html = renderCard(recipe, fullOptions(true), null);

    // Should not show nutrition section when data is null
    expect(html).not.toContain("Nutrition");
  });

  it("renders without ingredients", () => {
    const recipe = pluginRecipe({
      ingredients: [],
    });
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).not.toContain("Ingredients");
  });

  it("renders without instructions", () => {
    const recipe = pluginRecipe({
      instructions: [],
    });
    const html = renderCard(recipe, fullOptions(), null);

    expect(html).not.toContain("Instructions");
  });

  it("escapes HTML in title", () => {
    const recipe = pluginRecipe({ title: "Pasta <script>alert(1)</script>" });
    const html = renderCard(recipe, compactOptions(), null);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in description", () => {
    const recipe = pluginRecipe({
      description: 'A "great" recipe & more <b>bold</b>',
    });
    const html = renderCard(recipe, standardOptions(), null);

    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;b&gt;");
  });
});
