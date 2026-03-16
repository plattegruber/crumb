import { describe, it, expect } from "vitest";
import {
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
} from "../src/enums.js";
import type { RecipeStatus } from "../src/enums.js";

describe("RECIPE_STATUS", () => {
  it("has Draft, Active, Archived variants", () => {
    expect(RECIPE_STATUS.Draft).toBe("Draft");
    expect(RECIPE_STATUS.Active).toBe("Active");
    expect(RECIPE_STATUS.Archived).toBe("Archived");
  });

  it("has exactly 3 variants", () => {
    expect(Object.keys(RECIPE_STATUS)).toHaveLength(3);
  });
});

describe("DIETARY_TAG", () => {
  it("has all 9 tags", () => {
    expect(Object.keys(DIETARY_TAG)).toHaveLength(9);
    expect(DIETARY_TAG.GlutenFree).toBe("GlutenFree");
    expect(DIETARY_TAG.DairyFree).toBe("DairyFree");
    expect(DIETARY_TAG.Vegan).toBe("Vegan");
    expect(DIETARY_TAG.Vegetarian).toBe("Vegetarian");
    expect(DIETARY_TAG.Keto).toBe("Keto");
    expect(DIETARY_TAG.Paleo).toBe("Paleo");
    expect(DIETARY_TAG.NutFree).toBe("NutFree");
    expect(DIETARY_TAG.EggFree).toBe("EggFree");
    expect(DIETARY_TAG.SoyFree).toBe("SoyFree");
  });
});

describe("MEAL_TYPE", () => {
  it("has all 8 variants", () => {
    expect(Object.keys(MEAL_TYPE)).toHaveLength(8);
    expect(MEAL_TYPE.Breakfast).toBe("Breakfast");
    expect(MEAL_TYPE.Lunch).toBe("Lunch");
    expect(MEAL_TYPE.Dinner).toBe("Dinner");
    expect(MEAL_TYPE.Snack).toBe("Snack");
    expect(MEAL_TYPE.Dessert).toBe("Dessert");
    expect(MEAL_TYPE.Drink).toBe("Drink");
    expect(MEAL_TYPE.Condiment).toBe("Condiment");
    expect(MEAL_TYPE.Side).toBe("Side");
  });
});

describe("SEASON", () => {
  it("has all 5 variants", () => {
    expect(Object.keys(SEASON)).toHaveLength(5);
    expect(SEASON.Spring).toBe("Spring");
    expect(SEASON.Summer).toBe("Summer");
    expect(SEASON.Autumn).toBe("Autumn");
    expect(SEASON.Winter).toBe("Winter");
    expect(SEASON.Holiday).toBe("Holiday");
  });
});

describe("SUBSCRIPTION_TIER", () => {
  it("has all 4 tiers", () => {
    expect(Object.keys(SUBSCRIPTION_TIER)).toHaveLength(4);
    expect(SUBSCRIPTION_TIER.Free).toBe("Free");
    expect(SUBSCRIPTION_TIER.Creator).toBe("Creator");
    expect(SUBSCRIPTION_TIER.Pro).toBe("Pro");
    expect(SUBSCRIPTION_TIER.Studio).toBe("Studio");
  });
});

describe("PRODUCT_STATUS", () => {
  it("has Draft, Published, Archived variants", () => {
    expect(Object.keys(PRODUCT_STATUS)).toHaveLength(3);
    expect(PRODUCT_STATUS.Draft).toBe("Draft");
    expect(PRODUCT_STATUS.Published).toBe("Published");
    expect(PRODUCT_STATUS.Archived).toBe("Archived");
  });
});

describe("KIT_SCOPE", () => {
  it("has all 10 scopes", () => {
    expect(Object.keys(KIT_SCOPE)).toHaveLength(10);
    expect(KIT_SCOPE.SubscribersRead).toBe("SubscribersRead");
    expect(KIT_SCOPE.SubscribersWrite).toBe("SubscribersWrite");
    expect(KIT_SCOPE.BroadcastsRead).toBe("BroadcastsRead");
    expect(KIT_SCOPE.BroadcastsWrite).toBe("BroadcastsWrite");
    expect(KIT_SCOPE.TagsRead).toBe("TagsRead");
    expect(KIT_SCOPE.TagsWrite).toBe("TagsWrite");
    expect(KIT_SCOPE.SequencesRead).toBe("SequencesRead");
    expect(KIT_SCOPE.FormsRead).toBe("FormsRead");
    expect(KIT_SCOPE.PurchasesWrite).toBe("PurchasesWrite");
    expect(KIT_SCOPE.WebhooksWrite).toBe("WebhooksWrite");
  });
});

describe("WORDPRESS_RECIPE_PLUGIN", () => {
  it("has both plugins", () => {
    expect(Object.keys(WORDPRESS_RECIPE_PLUGIN)).toHaveLength(2);
    expect(WORDPRESS_RECIPE_PLUGIN.WpRecipeMaker).toBe("WpRecipeMaker");
    expect(WORDPRESS_RECIPE_PLUGIN.TastyRecipes).toBe("TastyRecipes");
  });
});

describe("NUTRITION_SOURCE", () => {
  it("has Calculated and ManuallyEntered", () => {
    expect(Object.keys(NUTRITION_SOURCE)).toHaveLength(2);
    expect(NUTRITION_SOURCE.Calculated).toBe("Calculated");
    expect(NUTRITION_SOURCE.ManuallyEntered).toBe("ManuallyEntered");
  });
});

describe("KIT_SUBSCRIBER_STATE", () => {
  it("has all 5 states", () => {
    expect(Object.keys(KIT_SUBSCRIBER_STATE)).toHaveLength(5);
    expect(KIT_SUBSCRIBER_STATE.Active).toBe("Active");
    expect(KIT_SUBSCRIBER_STATE.Inactive).toBe("Inactive");
    expect(KIT_SUBSCRIBER_STATE.Cancelled).toBe("Cancelled");
    expect(KIT_SUBSCRIBER_STATE.Bounced).toBe("Bounced");
    expect(KIT_SUBSCRIBER_STATE.Complained).toBe("Complained");
  });
});

describe("TEAM_MEMBER_ROLE", () => {
  it("has Member role", () => {
    expect(Object.keys(TEAM_MEMBER_ROLE)).toHaveLength(1);
    expect(TEAM_MEMBER_ROLE.Member).toBe("Member");
  });
});

describe("EBOOK_FORMAT", () => {
  it("has LetterSize and TradeSize", () => {
    expect(Object.keys(EBOOK_FORMAT)).toHaveLength(2);
    expect(EBOOK_FORMAT.LetterSize).toBe("LetterSize");
    expect(EBOOK_FORMAT.TradeSize).toBe("TradeSize");
  });
});

describe("PUBLISH_PLATFORM", () => {
  it("has StanStore, Gumroad, LTK", () => {
    expect(Object.keys(PUBLISH_PLATFORM)).toHaveLength(3);
    expect(PUBLISH_PLATFORM.StanStore).toBe("StanStore");
    expect(PUBLISH_PLATFORM.Gumroad).toBe("Gumroad");
    expect(PUBLISH_PLATFORM.LTK).toBe("LTK");
  });
});

describe("EVENT_SOURCE", () => {
  it("has KitWebhook, KitApiPoll, Internal", () => {
    expect(Object.keys(EVENT_SOURCE)).toHaveLength(3);
    expect(EVENT_SOURCE.KitWebhook).toBe("KitWebhook");
    expect(EVENT_SOURCE.KitApiPoll).toBe("KitApiPoll");
    expect(EVENT_SOURCE.Internal).toBe("Internal");
  });
});

describe("assertExhaustive", () => {
  it("throws when called at runtime", () => {
    expect(() => {
      assertExhaustive("impossible" as never);
    }).toThrow("Unexpected value: impossible");
  });

  it("works as exhaustiveness check in switch", () => {
    function label(s: RecipeStatus): string {
      switch (s) {
        case RECIPE_STATUS.Draft:
          return "Draft";
        case RECIPE_STATUS.Active:
          return "Active";
        case RECIPE_STATUS.Archived:
          return "Archived";
        default:
          return assertExhaustive(s);
      }
    }
    expect(label(RECIPE_STATUS.Draft)).toBe("Draft");
    expect(label(RECIPE_STATUS.Active)).toBe("Active");
    expect(label(RECIPE_STATUS.Archived)).toBe("Archived");
  });
});
