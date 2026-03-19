<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { Collection, Recipe } from "@dough/shared";
  import { collections, recipes as recipesApi } from "$lib/api.js";
  import RecipePicker from "$lib/components/RecipePicker.svelte";

  const collectionId = $derived($page.params.id ?? "");

  let collection = $state<Collection | null>(null);
  let recipeDetails = $state<Recipe[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showPicker = $state(false);
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);

  async function fetchCollection() {
    loading = true;
    error = null;
    try {
      collection = await collections.get(collectionId);
      // Fetch recipe details for display
      if (collection && collection.recipe_ids.length > 0) {
        const details: Recipe[] = [];
        for (const rid of collection.recipe_ids) {
          try {
            const r = await recipesApi.get(rid);
            details.push(r);
          } catch {
            // skip missing recipes
          }
        }
        recipeDetails = details;
      } else {
        recipeDetails = [];
      }
    } catch (e) {
      error = "Failed to load collection.";
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void fetchCollection();
  });

  async function handleAddRecipes(ids: string[]) {
    showPicker = false;
    for (const id of ids) {
      if (!collection?.recipe_ids.includes(id as never)) {
        try {
          await collections.addRecipe(collectionId, id);
        } catch (e) {
          console.error("Failed to add recipe:", e);
        }
      }
    }
    await fetchCollection();
  }

  async function handleRemoveRecipe(recipeId: string) {
    try {
      await collections.removeRecipe(collectionId, recipeId);
      await fetchCollection();
    } catch (e) {
      error = "Failed to remove recipe.";
      console.error(e);
    }
  }

  async function handleMoveUp(index: number) {
    if (index <= 0 || !collection) return;
    // Swap with previous: remove current, re-add in new position
    // The backend uses sort_order, so we remove + re-add
    const ids = [...collection.recipe_ids];
    const movingId = ids[index];
    const swapId = ids[index - 1];
    if (!movingId || !swapId) return;

    try {
      // Remove both and re-add in swapped order
      await collections.removeRecipe(collectionId, movingId);
      await collections.removeRecipe(collectionId, swapId);
      // Re-add: first the one that was moving up, then the one that was above
      // Actually we need to re-add all to maintain order. Simpler approach:
      // Remove all from index-1 onward and re-add in new order
      await collections.addRecipe(collectionId, movingId);
      await collections.addRecipe(collectionId, swapId);
      await fetchCollection();
    } catch (e) {
      error = "Failed to reorder.";
      console.error(e);
      await fetchCollection();
    }
  }

  async function handleMoveDown(index: number) {
    if (!collection || index >= collection.recipe_ids.length - 1) return;
    const ids = [...collection.recipe_ids];
    const movingId = ids[index];
    const swapId = ids[index + 1];
    if (!movingId || !swapId) return;

    try {
      await collections.removeRecipe(collectionId, movingId);
      await collections.removeRecipe(collectionId, swapId);
      await collections.addRecipe(collectionId, swapId);
      await collections.addRecipe(collectionId, movingId);
      await fetchCollection();
    } catch (e) {
      error = "Failed to reorder.";
      console.error(e);
      await fetchCollection();
    }
  }

  async function handleDelete() {
    deleting = true;
    try {
      await collections.delete(collectionId);
      await goto("/library/collections");
    } catch (e) {
      error = "Failed to delete collection.";
      console.error(e);
    } finally {
      deleting = false;
      showDeleteConfirm = false;
    }
  }

  function formatTime(minutes: number | null): string {
    if (minutes === null) return "";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function getRecipeForId(id: string): Recipe | undefined {
    return recipeDetails.find((r) => r.id === id);
  }
</script>

<svelte:head>
  <title>{collection?.name ?? "Collection"} - dough</title>
</svelte:head>

<div class="collection-detail">
  <a href="/library/collections" class="back-link">&larr; Back to Collections</a>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <p class="loading">Loading collection...</p>
  {:else if collection}
    <div class="collection-header">
      <div class="header-info">
        <h1>{collection.name}</h1>
        {#if collection.description}
          <p class="description">{collection.description}</p>
        {/if}
        <p class="recipe-count">
          {collection.recipe_ids.length} recipe{collection.recipe_ids.length === 1 ? "" : "s"}
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick={() => (showPicker = true)}>Add Recipe</button>
        <button class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>Delete</button>
      </div>
    </div>

    {#if collection.recipe_ids.length === 0}
      <div class="empty-state">
        <h3>No recipes in this collection</h3>
        <p>Add recipes to organize and use them in products.</p>
        <button class="btn btn-primary" onclick={() => (showPicker = true)}>Add Recipes</button>
      </div>
    {:else}
      <div class="recipe-list">
        {#each collection.recipe_ids as recipeId, index (recipeId)}
          {@const recipe = getRecipeForId(recipeId)}
          <div class="recipe-row">
            <span class="row-order">{index + 1}</span>
            <div class="row-info">
              {#if recipe}
                <a href="/library/{recipe.id}" class="row-title">{recipe.title}</a>
                <span class="row-meta">
                  {#if (recipe.timing?.total_minutes ?? recipe.total_minutes ?? null) !== null}
                    {formatTime(recipe.timing?.total_minutes ?? recipe.total_minutes ?? null)}
                  {/if}
                </span>
              {:else}
                <span class="row-title row-missing">Recipe not found</span>
              {/if}
            </div>
            <div class="row-actions">
              <button
                class="btn-icon"
                disabled={index === 0}
                onclick={() => handleMoveUp(index)}
                aria-label="Move up"
                title="Move up"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                class="btn-icon"
                disabled={index === collection.recipe_ids.length - 1}
                onclick={() => handleMoveDown(index)}
                aria-label="Move down"
                title="Move down"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <button
                class="btn-icon btn-icon-danger"
                onclick={() => handleRemoveRecipe(recipeId)}
                aria-label="Remove recipe"
                title="Remove"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if showDeleteConfirm}
      <div class="confirm-overlay">
        <div class="confirm-dialog card">
          <h3>Delete Collection</h3>
          <p>
            Are you sure you want to delete "{collection.name}"? This will not delete any recipes.
          </p>
          <div class="confirm-actions">
            <button class="btn" onclick={() => (showDeleteConfirm = false)}>Cancel</button>
            <button class="btn btn-danger" disabled={deleting} onclick={handleDelete}>
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if showPicker}
      <RecipePicker
        selectedIds={[...collection.recipe_ids]}
        onSelect={handleAddRecipes}
        onClose={() => (showPicker = false)}
      />
    {/if}
  {:else}
    <div class="empty-state">
      <h3>Collection not found</h3>
      <a href="/library/collections" class="btn">Return to Collections</a>
    </div>
  {/if}
</div>

<style>
  .collection-detail {
    max-width: var(--max-content-width);
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .collection-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .collection-header h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-1);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-1);
  }

  .recipe-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .recipe-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .recipe-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
  }

  .row-order {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .row-info {
    flex: 1;
    min-width: 0;
  }

  .row-title {
    font-weight: 500;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  a.row-title {
    color: var(--color-text);
    text-decoration: none;
  }

  a.row-title:hover {
    color: var(--color-primary);
  }

  .row-missing {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .row-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .row-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .btn-icon {
    width: 32px;
    height: 32px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
  }

  .btn-icon:hover:not(:disabled) {
    background: var(--color-bg-secondary);
    color: var(--color-text);
  }

  .btn-icon:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn-icon-danger:hover:not(:disabled) {
    color: var(--color-danger, #ef4444);
    border-color: var(--color-danger, #ef4444);
  }

  .btn-danger {
    background: var(--color-danger, #ef4444);
    color: white;
    border-color: var(--color-danger, #ef4444);
  }

  .btn-danger:hover {
    opacity: 0.9;
  }

  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  .confirm-dialog {
    max-width: 400px;
    width: 100%;
  }

  .confirm-dialog h3 {
    margin-bottom: var(--space-2);
  }

  .confirm-dialog p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-6);
  }

  .confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .error-banner {
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-danger, #ef4444);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    color: var(--color-text);
    margin-bottom: var(--space-2);
  }

  .empty-state p {
    margin-bottom: var(--space-6);
  }

  @media (max-width: 768px) {
    .collection-header {
      flex-direction: column;
    }

    .header-actions {
      width: 100%;
    }

    .row-actions {
      flex-direction: column;
    }
  }
</style>
