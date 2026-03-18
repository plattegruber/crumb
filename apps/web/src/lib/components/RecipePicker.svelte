<script lang="ts">
  import { onMount } from "svelte";
  import type { Recipe, DietaryTag } from "@dough/shared";
  import { recipes as recipesApi } from "$lib/api.js";
  import DietaryBadge from "./DietaryBadge.svelte";

  const {
    selectedIds = [],
    onSelect,
    onClose,
    multi = true,
  }: {
    selectedIds?: string[];
    onSelect: (ids: string[]) => void;
    onClose: () => void;
    multi?: boolean;
  } = $props();

  let query = $state("");
  let recipeList = $state<Recipe[]>([]);
  let loading = $state(true);
  // Track selections as an array to avoid the $derived/state warning
  let picked = $state<string[]>([]);

  onMount(() => {
    picked = [...selectedIds];
    void search();
  });

  function isSelected(id: string): boolean {
    return picked.includes(id);
  }

  async function search() {
    loading = true;
    try {
      const res = await recipesApi.list({ q: query || undefined, per_page: 50 });
      recipeList = res.recipes;
    } catch (e) {
      console.error("Failed to search recipes:", e);
    } finally {
      loading = false;
    }
  }

  function handleSearchSubmit(e: Event) {
    e.preventDefault();
    void search();
  }

  function toggleRecipe(id: string) {
    if (multi) {
      if (picked.includes(id)) {
        picked = picked.filter((p) => p !== id);
      } else {
        picked = [...picked, id];
      }
    } else {
      picked = [id];
    }
  }

  function handleConfirm() {
    onSelect([...picked]);
  }

  function formatTime(minutes: number | null): string {
    if (minutes === null) return "";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function getDietaryTags(recipe: Recipe): DietaryTag[] {
    const tags = recipe.classification.dietary.tags;
    if (
      tags instanceof Set ||
      (tags && typeof (tags as Iterable<DietaryTag>)[Symbol.iterator] === "function")
    ) {
      return [...new Set([...tags] as DietaryTag[])];
    }
    if (Array.isArray(tags)) return [...new Set(tags)] as DietaryTag[];
    return [];
  }
</script>

<div class="picker-overlay" role="dialog" aria-label="Pick recipes">
  <div class="picker-panel">
    <div class="picker-header">
      <h3>Select Recipes</h3>
      <button class="btn-close" onclick={onClose} aria-label="Close">&times;</button>
    </div>

    <form class="picker-search" onsubmit={handleSearchSubmit}>
      <input
        type="search"
        placeholder="Search recipes..."
        bind:value={query}
        class="picker-search-input"
      />
      <button type="submit" class="btn btn-primary btn-sm">Search</button>
    </form>

    <div class="picker-list">
      {#if loading}
        <p class="picker-loading">Loading recipes...</p>
      {:else if recipeList.length === 0}
        <p class="picker-empty">No recipes found.</p>
      {:else}
        {#each recipeList as recipe (recipe.id)}
          {@const selected = isSelected(recipe.id)}
          {@const tags = getDietaryTags(recipe)}
          <button
            type="button"
            class="picker-item"
            class:selected
            onclick={() => toggleRecipe(recipe.id)}
          >
            <span class="picker-check">{selected ? "+" : ""}</span>
            <div class="picker-item-info">
              <span class="picker-item-title">{recipe.title}</span>
              <span class="picker-item-meta">
                {#if recipe.timing.total_minutes !== null}
                  <span>{formatTime(recipe.timing.total_minutes)}</span>
                {/if}
                {#each tags.slice(0, 3) as tag (tag)}
                  <DietaryBadge {tag} />
                {/each}
              </span>
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <div class="picker-footer">
      <span class="picker-count">{picked.length} selected</span>
      <div class="picker-actions">
        <button type="button" class="btn" onclick={onClose}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={handleConfirm}>Confirm</button>
      </div>
    </div>
  </div>
</div>

<style>
  .picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-4);
  }

  .picker-panel {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
    width: 100%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border-light);
  }

  .picker-header h3 {
    font-size: var(--font-size-lg);
    margin: 0;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: var(--font-size-xl);
    cursor: pointer;
    color: var(--color-text-secondary);
    padding: var(--space-1);
    line-height: 1;
  }

  .picker-search {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border-light);
  }

  .picker-search-input {
    flex: 1;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }

  .picker-loading,
  .picker-empty {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-6);
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .picker-item:hover {
    background: var(--color-bg-secondary);
  }

  .picker-item.selected {
    background: var(--color-primary-light);
  }

  .picker-check {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--font-size-sm);
    flex-shrink: 0;
    color: var(--color-primary);
  }

  .picker-item.selected .picker-check {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-primary-text, white);
  }

  .picker-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .picker-item-title {
    font-weight: 500;
    font-size: var(--font-size-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border-light);
  }

  .picker-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .picker-actions {
    display: flex;
    gap: var(--space-2);
  }

  .btn-sm {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
  }

  @media (max-width: 768px) {
    .picker-panel {
      max-height: 90vh;
    }
  }
</style>
