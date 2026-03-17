<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { DietaryTag } from "@dough/shared";
  import { recipes } from "$lib/api.js";
  import {
    normalizeRecipeResponse,
    type NormalizedRecipe,
    type NormalizedQuantity,
  } from "$lib/api-types.js";
  import DietaryBadge from "$lib/components/DietaryBadge.svelte";

  let recipe = $state<NormalizedRecipe | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let deleting = $state(false);
  let showDeleteConfirm = $state(false);

  const recipeId = $derived($page.params["id"] ?? "");

  async function fetchRecipe() {
    loading = true;
    error = null;
    try {
      const res = await recipes.get(recipeId);
      recipe = normalizeRecipeResponse(res);
    } catch (e) {
      error = "Failed to load recipe.";
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function handleDelete() {
    deleting = true;
    try {
      await recipes.delete(recipeId);
      await goto("/library");
    } catch (e) {
      error = "Failed to delete recipe.";
      console.error(e);
    } finally {
      deleting = false;
      showDeleteConfirm = false;
    }
  }

  function formatTime(minutes: number | null): string {
    if (minutes === null) return "--";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function formatQuantity(q: NormalizedQuantity | null): string {
    if (q === null) return "";
    switch (q.type) {
      case "WholeNumber":
        return String(q.value ?? "");
      case "Fraction":
        return `${q.numerator ?? ""}/${q.denominator ?? ""}`;
      case "Mixed":
        return `${q.whole ?? ""} ${q.numerator ?? ""}/${q.denominator ?? ""}`;
      case "Decimal":
        return String(q.value ?? "");
      default:
        return "";
    }
  }

  onMount(() => {
    void fetchRecipe();
  });
</script>

<svelte:head>
  <title>{recipe?.title ?? "Recipe"} - dough</title>
</svelte:head>

<div class="recipe-detail">
  <a href="/library" class="back-link">&larr; Back to Library</a>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading recipe...</div>
  {:else if recipe}
    <div class="recipe-header">
      <div class="recipe-header-text">
        <h1>{recipe.title}</h1>
        {#if recipe.description}
          <p class="description">{recipe.description}</p>
        {/if}
        <div class="status-row">
          <span class="recipe-status" data-status={recipe.status}>
            {recipe.status}
          </span>
          {#if recipe.email_ready}
            <span class="email-ready">Email Ready</span>
          {/if}
        </div>
      </div>

      <div class="recipe-actions">
        <a href="/library/{recipeId}/edit" class="btn">Edit</a>
        <button
          class="btn btn-danger"
          onclick={() => (showDeleteConfirm = true)}
          disabled={deleting}
        >
          Archive
        </button>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    {#if showDeleteConfirm}
      <div class="confirm-banner">
        <p>Are you sure you want to archive this recipe?</p>
        <div class="confirm-actions">
          <button class="btn" onclick={() => (showDeleteConfirm = false)}>Cancel</button>
          <button class="btn btn-danger" onclick={handleDelete} disabled={deleting}>
            {deleting ? "Archiving..." : "Yes, Archive"}
          </button>
        </div>
      </div>
    {/if}

    <!-- Hero photo -->
    {#if recipe.photos.length > 0 && recipe.photos[0]}
      <div class="hero-photo">
        <img src={recipe.photos[0].url} alt={recipe.photos[0].alt_text ?? recipe.title} />
      </div>
    {/if}

    <!-- Timing & yield -->
    <div class="meta-row">
      <div class="meta-card">
        <span class="meta-label">Prep</span>
        <span class="meta-value">{formatTime(recipe.timing.prep_minutes)}</span>
      </div>
      <div class="meta-card">
        <span class="meta-label">Cook</span>
        <span class="meta-value">{formatTime(recipe.timing.cook_minutes)}</span>
      </div>
      <div class="meta-card">
        <span class="meta-label">Total</span>
        <span class="meta-value">{formatTime(recipe.timing.total_minutes)}</span>
      </div>
      {#if recipe.yield}
        <div class="meta-card">
          <span class="meta-label">Yield</span>
          <span class="meta-value">{recipe.yield.quantity} {recipe.yield.unit}</span>
        </div>
      {/if}
    </div>

    <!-- Dietary tags -->
    {#if recipe.dietary_tags.length > 0}
      <div class="tags-section">
        {#each recipe.dietary_tags as tag (tag)}
          <DietaryBadge tag={tag as DietaryTag} />
        {/each}
      </div>
    {/if}

    <!-- Ingredients -->
    {#if recipe.ingredientGroups.length > 0}
      <section class="recipe-section">
        <h2>Ingredients</h2>
        {#each recipe.ingredientGroups as group, i (i)}
          {#if group.label}
            <h3 class="group-label">{group.label}</h3>
          {/if}
          <ul class="ingredient-list">
            {#each group.ingredients as ingredient (ingredient.id)}
              <li>
                {#if ingredient.quantity}
                  <span class="ingredient-qty">{formatQuantity(ingredient.quantity)}</span>
                {/if}
                {#if ingredient.unit}
                  <span class="ingredient-unit">{ingredient.unit}</span>
                {/if}
                <span class="ingredient-item">{ingredient.item}</span>
                {#if ingredient.notes}
                  <span class="ingredient-notes">, {ingredient.notes}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      </section>
    {/if}

    <!-- Instructions -->
    {#if recipe.instructionGroups.length > 0}
      <section class="recipe-section">
        <h2>Instructions</h2>
        {#each recipe.instructionGroups as group, i (i)}
          {#if group.label}
            <h3 class="group-label">{group.label}</h3>
          {/if}
          <ol class="instruction-list">
            {#each group.instructions as instruction (instruction.id)}
              <li>{instruction.body}</li>
            {/each}
          </ol>
        {/each}
      </section>
    {/if}

    <!-- Notes -->
    {#if recipe.notes}
      <section class="recipe-section">
        <h2>Notes</h2>
        <p class="notes-text">{recipe.notes}</p>
      </section>
    {/if}

    <!-- Classification -->
    {#if recipe.cuisine || recipe.meal_types.length > 0 || recipe.seasons.length > 0}
      <section class="recipe-section">
        <h2>Classification</h2>
        <div class="classification-grid">
          {#if recipe.cuisine}
            <div class="classification-item">
              <span class="meta-label">Cuisine</span>
              <span>{recipe.cuisine}</span>
            </div>
          {/if}
          {#if recipe.meal_types.length > 0}
            <div class="classification-item">
              <span class="meta-label">Meal Type</span>
              <div class="classification-tags">
                {#each recipe.meal_types as mt (mt)}
                  <span class="classification-tag">{mt}</span>
                {/each}
              </div>
            </div>
          {/if}
          {#if recipe.seasons.length > 0}
            <div class="classification-item">
              <span class="meta-label">Season</span>
              <div class="classification-tags">
                {#each recipe.seasons as s (s)}
                  <span class="classification-tag">{s}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </section>
    {/if}
  {:else}
    <div class="empty-state">
      <h3>Recipe not found</h3>
      <p>This recipe may have been deleted.</p>
      <a href="/library" class="btn">Return to Library</a>
    </div>
  {/if}
</div>

<style>
  .recipe-detail {
    max-width: 780px;
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .recipe-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .recipe-header h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .status-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .recipe-status {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
  }

  .recipe-status[data-status="Active"] {
    color: var(--color-success);
    background: var(--color-success-light);
  }

  .recipe-status[data-status="Draft"] {
    color: var(--color-warning);
    background: var(--color-warning-light);
  }

  .email-ready {
    padding: 2px 6px;
    background: var(--color-success-light);
    color: var(--color-success);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 500;
  }

  .recipe-actions {
    flex-shrink: 0;
    display: flex;
    gap: var(--space-2);
  }

  /* Confirm banner */
  .confirm-banner {
    padding: var(--space-4);
    background: var(--color-warning-light);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-6);
  }

  .confirm-banner p {
    margin-bottom: var(--space-3);
    font-weight: 500;
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .hero-photo {
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin-bottom: var(--space-6);
    aspect-ratio: 16 / 9;
  }

  .hero-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .meta-row {
    display: flex;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
  }

  .meta-card {
    display: flex;
    flex-direction: column;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    min-width: 100px;
  }

  .meta-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .meta-value {
    font-size: var(--font-size-lg);
    font-weight: 600;
  }

  .tags-section {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
  }

  .recipe-section {
    margin-bottom: var(--space-8);
  }

  .recipe-section h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border-light);
  }

  .group-label {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-top: var(--space-4);
    margin-bottom: var(--space-2);
  }

  .ingredient-list {
    list-style: none;
    padding: 0;
  }

  .ingredient-list li {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .ingredient-qty {
    font-weight: 600;
    margin-right: var(--space-1);
  }

  .ingredient-unit {
    color: var(--color-text-secondary);
    margin-right: var(--space-1);
  }

  .ingredient-notes {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .instruction-list {
    padding-left: var(--space-6);
  }

  .instruction-list li {
    padding: var(--space-2) 0;
    line-height: 1.6;
  }

  .notes-text {
    line-height: 1.6;
    color: var(--color-text-secondary);
    white-space: pre-wrap;
  }

  .classification-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
  }

  .classification-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .classification-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .classification-tag {
    display: inline-block;
    padding: 2px 10px;
    border-radius: var(--radius-xl);
    font-size: var(--font-size-sm);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-16);
  }

  .empty-state h3 {
    margin-bottom: var(--space-2);
  }

  .empty-state p {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-4);
  }

  .error-banner {
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light);
    color: var(--color-danger);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  @media (max-width: 768px) {
    .recipe-header {
      flex-direction: column;
    }

    .meta-row {
      flex-direction: column;
      gap: var(--space-2);
    }

    .classification-grid {
      flex-direction: column;
    }
  }
</style>
