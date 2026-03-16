import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.crumb.kitchen",
  integrations: [
    starlight({
      title: "crumb docs",
      description: "Documentation for crumb — recipe intelligence for food creators who use Kit.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/plattegruber/crumb",
        },
      ],
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { slug: "getting-started/introduction" },
            { slug: "getting-started/quick-start" },
            { slug: "getting-started/concepts" },
          ],
        },
        {
          label: "Recipe Library",
          items: [
            { slug: "recipes/overview" },
            { slug: "recipes/creating-recipes" },
            { slug: "recipes/importing" },
            { slug: "recipes/collections" },
            { slug: "recipes/search-and-filter" },
          ],
        },
        {
          label: "Email Integration",
          items: [
            { slug: "email/recipe-cards" },
            { slug: "email/display-modes" },
            { slug: "email/save-this-recipe" },
            { slug: "email/broadcast-drafts" },
          ],
        },
        {
          label: "Digital Products",
          items: [
            { slug: "products/overview" },
            { slug: "products/ebooks" },
            { slug: "products/meal-plans" },
            { slug: "products/recipe-card-packs" },
            { slug: "products/lead-magnets" },
            { slug: "products/publishing" },
          ],
        },
        {
          label: "Audience Growth",
          items: [
            { slug: "growth/segmentation" },
            { slug: "growth/dietary-tags" },
            { slug: "growth/analytics" },
            { slug: "growth/recommendations" },
            { slug: "growth/automations" },
          ],
        },
        {
          label: "Kit Integration",
          items: [
            { slug: "kit/connecting" },
            { slug: "kit/tags-and-fields" },
            { slug: "kit/webhooks" },
            { slug: "kit/forms" },
          ],
        },
        {
          label: "Account & Settings",
          items: [
            { slug: "settings/brand-kit" },
            { slug: "settings/subscription-tiers" },
            { slug: "settings/team-members" },
            { slug: "settings/wordpress" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { slug: "api/authentication" },
            { slug: "api/recipes" },
            { slug: "api/products" },
            { slug: "api/webhooks" },
          ],
        },
      ],
    }),
  ],
});
