<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import type { Product, Recipe } from "@dough/shared";
  import { PUBLISH_PLATFORM } from "@dough/shared";
  import { products, recipes as recipesApi } from "$lib/api.js";

  let product = $state<Product | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  const recipeDetails = new SvelteMap<string, Recipe>();
  let publishPlatform = $state("StanStore");
  let publishing = $state(false);
  let generatingLeadMagnet = $state(false);

  const productId = $derived($page.params.id ?? "");

  // Get recipe IDs from the product
  const recipeIds = $derived.by((): string[] => {
    if (!product) return [];
    switch (product.type) {
      case "Ebook":
        return [...product.detail.recipe_ids] as string[];
      case "MealPlan": {
        const ids = new SvelteSet<string>();
        for (const day of product.detail.days) {
          if (day.breakfast !== null) ids.add(day.breakfast as string);
          if (day.lunch !== null) ids.add(day.lunch as string);
          if (day.dinner !== null) ids.add(day.dinner as string);
          for (const s of day.snacks) ids.add(s as string);
        }
        return Array.from(ids);
      }
      case "RecipeCardPack":
        return [...product.recipe_ids] as string[];
      case "LeadMagnet":
        return [...product.recipe_ids] as string[];
      default:
        return [];
    }
  });

  onMount(async () => {
    try {
      product = await products.get(productId);
      if (product) {
        const ids = getRecipeIdsFromProduct(product);
        await fetchRecipeDetails(ids);
      }
    } catch (e) {
      error = "Failed to load product.";
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function getRecipeIdsFromProduct(p: Product): string[] {
    switch (p.type) {
      case "Ebook":
        return [...p.detail.recipe_ids] as string[];
      case "MealPlan": {
        const ids = new SvelteSet<string>();
        for (const day of p.detail.days) {
          if (day.breakfast !== null) ids.add(day.breakfast as string);
          if (day.lunch !== null) ids.add(day.lunch as string);
          if (day.dinner !== null) ids.add(day.dinner as string);
          for (const s of day.snacks) ids.add(s as string);
        }
        return Array.from(ids);
      }
      case "RecipeCardPack":
        return [...p.recipe_ids] as string[];
      case "LeadMagnet":
        return [...p.recipe_ids] as string[];
      default:
        return [];
    }
  }

  async function fetchRecipeDetails(ids: string[]) {
    for (const id of ids) {
      try {
        const recipe = await recipesApi.get(id);
        recipeDetails.set(id, recipe);
      } catch {
        // skip
      }
    }
  }

  async function handlePublish() {
    if (!product) return;
    publishing = true;
    error = null;
    try {
      product = await products.publish(productId, publishPlatform);
    } catch (e) {
      error = "Failed to publish. The product may need a rendered PDF and reviewed AI copy first.";
      console.error(e);
    } finally {
      publishing = false;
    }
  }

  async function handleGenerateLeadMagnet() {
    if (!product) return;
    generatingLeadMagnet = true;
    error = null;
    try {
      await products.generateLeadMagnet(productId);
    } catch (e) {
      error = "Failed to generate lead magnet.";
      console.error(e);
    } finally {
      generatingLeadMagnet = false;
    }
  }

  function getRecipeName(id: string): string {
    return recipeDetails.get(id)?.title ?? "Loading...";
  }

  const platformEntries = Object.entries(PUBLISH_PLATFORM) as [string, string][];
</script>

<svelte:head>
  <title>{product?.base.title ?? "Product"} - dough</title>
</svelte:head>

<div class="product-detail">
  <a href="/products" class="back-link">&larr; Back to Products</a>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <p class="loading">Loading product...</p>
  {:else if product}
    <div class="product-header">
      <div class="header-info">
        <span class="product-type-badge">{product.type}</span>
        <h1>{product.base.title}</h1>
        {#if product.base.description}
          <p class="description">{product.base.description}</p>
        {/if}
        <div class="header-meta">
          <span class="product-status" data-status={product.base.status}>
            {product.base.status}
          </span>
          {#if product.base.suggested_price_cents !== null}
            <span class="product-price">
              ${(product.base.suggested_price_cents / 100).toFixed(2)}
              {product.base.currency}
            </span>
          {/if}
        </div>
      </div>
    </div>

    <!-- Ebook details -->
    {#if product.type === "Ebook"}
      <section class="detail-section">
        <h2>Chapters</h2>
        {#each product.detail.chapters as chapter, i (i)}
          <div class="chapter-summary">
            <strong>{chapter.title}</strong>
            <span class="chapter-count">
              {chapter.recipe_ids.length} recipe{chapter.recipe_ids.length === 1 ? "" : "s"}
            </span>
            <ul>
              {#each chapter.recipe_ids as rid (rid)}
                <li>
                  <a href="/library/{rid}">{getRecipeName(rid)}</a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>

      {#if product.detail.intro_copy}
        <section class="detail-section">
          <h2>Introduction</h2>
          <p class="copy-text">{product.detail.intro_copy}</p>
        </section>
      {/if}

      {#if product.detail.author_bio}
        <section class="detail-section">
          <h2>Author Bio</h2>
          <p class="copy-text">{product.detail.author_bio}</p>
        </section>
      {/if}

      <!-- Meal Plan details -->
    {:else if product.type === "MealPlan"}
      <section class="detail-section">
        <h2>Schedule ({product.detail.days.length} days)</h2>
        <div class="mp-schedule">
          {#each product.detail.days as day (day.day_number)}
            <div class="mp-day card">
              <h4>Day {day.day_number}</h4>
              <div class="mp-meals">
                {#if day.breakfast}
                  <div class="mp-meal">
                    <span class="mp-meal-label">Breakfast</span>
                    <a href="/library/{day.breakfast}">{getRecipeName(day.breakfast)}</a>
                  </div>
                {/if}
                {#if day.lunch}
                  <div class="mp-meal">
                    <span class="mp-meal-label">Lunch</span>
                    <a href="/library/{day.lunch}">{getRecipeName(day.lunch)}</a>
                  </div>
                {/if}
                {#if day.dinner}
                  <div class="mp-meal">
                    <span class="mp-meal-label">Dinner</span>
                    <a href="/library/{day.dinner}">{getRecipeName(day.dinner)}</a>
                  </div>
                {/if}
                {#each day.snacks as snack (snack)}
                  <div class="mp-meal">
                    <span class="mp-meal-label">Snack</span>
                    <a href="/library/{snack}">{getRecipeName(snack)}</a>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>

      {#if product.detail.shopping_list}
        <section class="detail-section">
          <h2>Shopping List</h2>
          {#each product.detail.shopping_list.sections as section (section.label)}
            <div class="shopping-group">
              <h4>{section.label}</h4>
              <ul>
                {#each section.items as item (item.item)}
                  <li>{item.item}</li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/if}

      <!-- Recipe Card Pack / Lead Magnet -->
    {:else}
      <section class="detail-section">
        <h2>Recipes</h2>
        <ul class="recipe-list-simple">
          {#each recipeIds as rid (rid)}
            <li>
              <a href="/library/{rid}">{getRecipeName(rid)}</a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Actions -->
    <section class="detail-section actions-section">
      <h2>Actions</h2>
      <div class="action-group">
        {#if product.base.pdf_url}
          <a href={product.base.pdf_url} class="btn" target="_blank" rel="noopener">
            Download PDF
          </a>
        {:else}
          <span class="action-info">PDF not yet rendered.</span>
        {/if}

        {#if product.base.epub_url}
          <a href={product.base.epub_url} class="btn" target="_blank" rel="noopener">
            Download EPUB
          </a>
        {/if}
      </div>

      <!-- Publish -->
      <div class="action-group">
        <h3>Publish</h3>
        <div class="publish-row">
          <select bind:value={publishPlatform}>
            {#each platformEntries as [, value] (value)}
              <option {value}>{value}</option>
            {/each}
          </select>
          <button
            class="btn btn-primary"
            disabled={publishing || product.base.status === "Published"}
            onclick={handlePublish}
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
        {#if product.base.status === "Published"}
          <p class="action-info">Already published.</p>
        {/if}
      </div>

      <!-- Lead Magnet (for ebooks) -->
      {#if product.type === "Ebook"}
        <div class="action-group">
          <h3>Lead Magnet</h3>
          <p class="action-desc">Generate a free sample ebook with your top-performing recipes.</p>
          <button class="btn" disabled={generatingLeadMagnet} onclick={handleGenerateLeadMagnet}>
            {generatingLeadMagnet ? "Generating..." : "Generate Lead Magnet"}
          </button>
        </div>
      {/if}
    </section>
  {:else}
    <div class="empty-state">
      <h3>Product not found</h3>
      <a href="/products" class="btn">Return to Products</a>
    </div>
  {/if}
</div>

<style>
  .product-detail {
    max-width: 780px;
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .error-banner {
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-danger, #ef4444);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .product-header {
    margin-bottom: var(--space-8);
  }

  .product-type-badge {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    display: block;
    margin-bottom: var(--space-2);
  }

  .product-header h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .header-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .product-status {
    font-size: var(--font-size-sm);
    font-weight: 600;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-xl);
  }

  .product-status[data-status="Published"] {
    background: var(--color-success-light, #ecfdf5);
    color: var(--color-success, #22c55e);
  }

  .product-status[data-status="Draft"] {
    background: var(--color-warning-light, #fffbeb);
    color: var(--color-warning, #f59e0b);
  }

  .product-status[data-status="Archived"] {
    background: var(--color-bg-secondary);
    color: var(--color-text-muted);
  }

  .product-price {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .detail-section {
    margin-bottom: var(--space-8);
  }

  .detail-section h2 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border-light);
  }

  /* Chapters */
  .chapter-summary {
    margin-bottom: var(--space-4);
  }

  .chapter-count {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    margin-left: var(--space-2);
  }

  .chapter-summary ul {
    padding-left: var(--space-6);
    margin-top: var(--space-1);
    font-size: var(--font-size-sm);
  }

  .chapter-summary a {
    color: var(--color-text-secondary);
    text-decoration: none;
  }

  .chapter-summary a:hover {
    color: var(--color-primary);
  }

  .copy-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  /* Meal Plan */
  .mp-schedule {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .mp-day h4 {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .mp-meals {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .mp-meal {
    font-size: var(--font-size-sm);
    display: flex;
    gap: var(--space-2);
  }

  .mp-meal-label {
    color: var(--color-text-muted);
    font-weight: 500;
    min-width: 70px;
    font-size: var(--font-size-xs);
  }

  .mp-meal a {
    color: var(--color-text-secondary);
    text-decoration: none;
  }

  .mp-meal a:hover {
    color: var(--color-primary);
  }

  /* Shopping List */
  .shopping-group {
    margin-bottom: var(--space-4);
  }

  .shopping-group h4 {
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-1);
  }

  .shopping-group ul {
    padding-left: var(--space-6);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Simple recipe list */
  .recipe-list-simple {
    padding-left: var(--space-6);
  }

  .recipe-list-simple li {
    padding: var(--space-1) 0;
  }

  .recipe-list-simple a {
    color: var(--color-text-secondary);
    text-decoration: none;
  }

  .recipe-list-simple a:hover {
    color: var(--color-primary);
  }

  /* Actions */
  .actions-section {
    padding: var(--space-6);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .actions-section h2 {
    border-bottom: none;
    padding-bottom: 0;
  }

  .action-group {
    margin-bottom: var(--space-6);
  }

  .action-group:last-child {
    margin-bottom: 0;
  }

  .action-group h3 {
    font-size: var(--font-size-base);
    margin-bottom: var(--space-2);
  }

  .action-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .action-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .publish-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .publish-row select {
    max-width: 200px;
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    color: var(--color-text);
    margin-bottom: var(--space-4);
  }

  @media (max-width: 768px) {
    .mp-schedule {
      grid-template-columns: 1fr;
    }

    .publish-row {
      flex-direction: column;
      align-items: stretch;
    }

    .publish-row select {
      max-width: 100%;
    }
  }
</style>
