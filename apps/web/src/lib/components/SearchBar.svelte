<script lang="ts">
  import { DIETARY_TAG, MEAL_TYPE, RECIPE_STATUS } from "@crumb/shared";
  import type { DietaryTag, MealType, RecipeStatus } from "@crumb/shared";

  const {
    onSearch,
  }: {
    onSearch: (params: {
      query: string;
      status: string;
      mealType: string;
      dietaryTags: string[];
    }) => void;
  } = $props();

  let localQuery = $state("");
  let localStatus = $state("");
  let localMealType = $state("");
  let localDietaryTags = $state<string[]>([]);
  let showFilters = $state(false);

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSearch({
      query: localQuery,
      status: localStatus,
      mealType: localMealType,
      dietaryTags: localDietaryTags,
    });
  }

  function toggleTag(tag: string) {
    if (localDietaryTags.includes(tag)) {
      localDietaryTags = localDietaryTags.filter((t) => t !== tag);
    } else {
      localDietaryTags = [...localDietaryTags, tag];
    }
  }

  function clearFilters() {
    localQuery = "";
    localStatus = "";
    localMealType = "";
    localDietaryTags = [];
    onSearch({ query: "", status: "", mealType: "", dietaryTags: [] });
  }

  const hasFilters = $derived(
    localStatus !== "" || localMealType !== "" || localDietaryTags.length > 0,
  );

  const dietaryTagEntries = Object.entries(DIETARY_TAG) as [string, DietaryTag][];
  const mealTypeEntries = Object.entries(MEAL_TYPE) as [string, MealType][];
  const statusEntries = Object.entries(RECIPE_STATUS) as [string, RecipeStatus][];

  const dietaryLabels: Record<string, string> = {
    GlutenFree: "Gluten-Free",
    DairyFree: "Dairy-Free",
    Vegan: "Vegan",
    Vegetarian: "Vegetarian",
    Keto: "Keto",
    Paleo: "Paleo",
    NutFree: "Nut-Free",
    EggFree: "Egg-Free",
    SoyFree: "Soy-Free",
  };
</script>

<form class="search-bar" onsubmit={handleSubmit}>
  <div class="search-row">
    <div class="search-input-wrap">
      <svg
        class="search-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        placeholder="Search recipes..."
        bind:value={localQuery}
        class="search-input"
      />
    </div>

    <button type="submit" class="btn btn-primary">Search</button>

    <button
      type="button"
      class={["btn btn-ghost filter-toggle", { active: showFilters || hasFilters }]}
      onclick={() => (showFilters = !showFilters)}
    >
      Filters
      {#if hasFilters}
        <span class="filter-count"
          >{(localStatus !== "" ? 1 : 0) +
            (localMealType !== "" ? 1 : 0) +
            localDietaryTags.length}</span
        >
      {/if}
    </button>
  </div>

  {#if showFilters}
    <div class="filters">
      <div class="filter-group">
        <label for="status-filter">Status</label>
        <select id="status-filter" bind:value={localStatus}>
          <option value="">All</option>
          {#each statusEntries as [, value] (value)}
            <option {value}>{value}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label for="meal-type-filter">Meal Type</label>
        <select id="meal-type-filter" bind:value={localMealType}>
          <option value="">All</option>
          {#each mealTypeEntries as [, value] (value)}
            <option {value}>{value}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group full-width">
        <span class="filter-label" id="dietary-label">Dietary</span>
        <div class="tag-buttons" role="group" aria-labelledby="dietary-label">
          {#each dietaryTagEntries as [, value] (value)}
            <button
              type="button"
              class={["tag-btn", { selected: localDietaryTags.includes(value) }]}
              onclick={() => toggleTag(value)}
            >
              {dietaryLabels[value] ?? value}
            </button>
          {/each}
        </div>
      </div>

      {#if hasFilters}
        <button type="button" class="btn btn-ghost clear-btn" onclick={clearFilters}>
          Clear filters
        </button>
      {/if}
    </div>
  {/if}
</form>

<style>
  .search-bar {
    margin-bottom: var(--space-6);
  }

  .search-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .search-input-wrap {
    flex: 1;
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-input {
    padding-left: calc(var(--space-3) + 20px);
  }

  .filter-toggle.active {
    color: var(--color-primary);
  }

  .filter-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-text);
    font-size: 11px;
    font-weight: 700;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-top: var(--space-4);
    padding: var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .filter-group {
    min-width: 150px;
  }

  .filter-group.full-width {
    width: 100%;
  }

  .filter-group select {
    max-width: 200px;
  }

  .filter-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text);
  }

  .tag-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .tag-btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-xl);
    font-size: var(--font-size-xs);
    font-weight: 500;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tag-btn.selected {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .clear-btn {
    margin-left: auto;
    align-self: flex-end;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  @media (max-width: 768px) {
    .search-row {
      flex-wrap: wrap;
    }

    .search-input-wrap {
      min-width: 100%;
    }
  }
</style>
