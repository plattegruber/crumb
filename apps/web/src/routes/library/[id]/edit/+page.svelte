<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { recipes } from "$lib/api.js";
  import {
    normalizeRecipeResponse,
    type NormalizedRecipe,
    type NormalizedQuantity,
  } from "$lib/api-types.js";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const recipeId = $derived($page.params["id"] ?? "");

  let loadingRecipe = $state(true);
  let loadError = $state<string | null>(null);

  let title = $state("");
  let description = $state("");
  let prepMinutes = $state("");
  let cookMinutes = $state("");
  let yieldQuantity = $state("");
  let yieldUnit = $state("servings");
  let notes = $state("");
  let cuisine = $state("");
  let mealTypes = $state<string[]>([]);
  let seasons = $state<string[]>([]);

  // Ingredient groups
  interface IngredientEntry {
    id: string;
    quantity: string;
    unit: string;
    item: string;
    notes: string;
  }

  interface IngredientGroupEntry {
    id: string;
    label: string;
    ingredients: IngredientEntry[];
  }

  function createIngredient(): IngredientEntry {
    return { id: crypto.randomUUID(), quantity: "", unit: "", item: "", notes: "" };
  }

  function createIngredientGroup(): IngredientGroupEntry {
    return {
      id: crypto.randomUUID(),
      label: "",
      ingredients: [createIngredient()],
    };
  }

  let ingredientGroups = $state<IngredientGroupEntry[]>([createIngredientGroup()]);

  // Instruction groups
  interface InstructionEntry {
    id: string;
    body: string;
  }

  interface InstructionGroupEntry {
    id: string;
    label: string;
    instructions: InstructionEntry[];
  }

  function createInstruction(): InstructionEntry {
    return { id: crypto.randomUUID(), body: "" };
  }

  function createInstructionGroup(): InstructionGroupEntry {
    return {
      id: crypto.randomUUID(),
      label: "",
      instructions: [createInstruction()],
    };
  }

  let instructionGroups = $state<InstructionGroupEntry[]>([createInstructionGroup()]);

  let submitting = $state(false);
  let error = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load existing recipe
  // ---------------------------------------------------------------------------

  function formatQuantityForEdit(q: NormalizedQuantity | null): string {
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

  function populateForm(r: NormalizedRecipe) {
    title = r.title;
    description = r.description ?? "";
    prepMinutes = r.timing.prep_minutes !== null ? String(r.timing.prep_minutes) : "";
    cookMinutes = r.timing.cook_minutes !== null ? String(r.timing.cook_minutes) : "";
    yieldQuantity = r.yield !== null ? String(r.yield.quantity) : "";
    yieldUnit = r.yield !== null ? r.yield.unit : "servings";
    notes = r.notes ?? "";
    cuisine = r.cuisine ?? "";
    mealTypes = [...r.meal_types];
    seasons = [...r.seasons];

    // Populate ingredient groups
    if (r.ingredientGroups.length > 0) {
      ingredientGroups = r.ingredientGroups.map((g) => ({
        id: crypto.randomUUID(),
        label: g.label ?? "",
        ingredients:
          g.ingredients.length > 0
            ? g.ingredients.map((ing) => ({
                id: ing.id,
                quantity: formatQuantityForEdit(ing.quantity),
                unit: ing.unit ?? "",
                item: ing.item,
                notes: ing.notes ?? "",
              }))
            : [createIngredient()],
      }));
    } else {
      ingredientGroups = [createIngredientGroup()];
    }

    // Populate instruction groups
    if (r.instructionGroups.length > 0) {
      instructionGroups = r.instructionGroups.map((g) => ({
        id: crypto.randomUUID(),
        label: g.label ?? "",
        instructions:
          g.instructions.length > 0
            ? g.instructions.map((inst) => ({
                id: inst.id,
                body: inst.body,
              }))
            : [createInstruction()],
      }));
    } else {
      instructionGroups = [createInstructionGroup()];
    }
  }

  async function fetchRecipe() {
    loadingRecipe = true;
    loadError = null;
    try {
      const res = await recipes.get(recipeId);
      const normalized = normalizeRecipeResponse(res);
      populateForm(normalized);
    } catch (e) {
      loadError = "Failed to load recipe for editing.";
      console.error(e);
    } finally {
      loadingRecipe = false;
    }
  }

  onMount(() => {
    void fetchRecipe();
  });

  // ---------------------------------------------------------------------------
  // Ingredient helpers
  // ---------------------------------------------------------------------------

  function addIngredient(groupIndex: number) {
    const group = ingredientGroups[groupIndex];
    if (group) {
      group.ingredients = [...group.ingredients, createIngredient()];
    }
  }

  function removeIngredient(groupIndex: number, ingIndex: number) {
    const group = ingredientGroups[groupIndex];
    if (group && group.ingredients.length > 1) {
      group.ingredients = group.ingredients.filter((_, i) => i !== ingIndex);
    }
  }

  function moveIngredient(groupIndex: number, ingIndex: number, direction: -1 | 1) {
    const group = ingredientGroups[groupIndex];
    if (!group) return;
    const newIndex = ingIndex + direction;
    if (newIndex < 0 || newIndex >= group.ingredients.length) return;
    const items = [...group.ingredients];
    const moving = items[ingIndex];
    const target = items[newIndex];
    if (moving && target) {
      items[ingIndex] = target;
      items[newIndex] = moving;
      group.ingredients = items;
    }
  }

  function addIngredientGroup() {
    ingredientGroups = [...ingredientGroups, createIngredientGroup()];
  }

  function removeIngredientGroup(groupIndex: number) {
    if (ingredientGroups.length > 1) {
      ingredientGroups = ingredientGroups.filter((_, i) => i !== groupIndex);
    }
  }

  // ---------------------------------------------------------------------------
  // Instruction helpers
  // ---------------------------------------------------------------------------

  function addInstruction(groupIndex: number) {
    const group = instructionGroups[groupIndex];
    if (group) {
      group.instructions = [...group.instructions, createInstruction()];
    }
  }

  function removeInstruction(groupIndex: number, instIndex: number) {
    const group = instructionGroups[groupIndex];
    if (group && group.instructions.length > 1) {
      group.instructions = group.instructions.filter((_, i) => i !== instIndex);
    }
  }

  function moveInstruction(groupIndex: number, instIndex: number, direction: -1 | 1) {
    const group = instructionGroups[groupIndex];
    if (!group) return;
    const newIndex = instIndex + direction;
    if (newIndex < 0 || newIndex >= group.instructions.length) return;
    const items = [...group.instructions];
    const moving = items[instIndex];
    const target = items[newIndex];
    if (moving && target) {
      items[instIndex] = target;
      items[newIndex] = moving;
      group.instructions = items;
    }
  }

  function addInstructionGroup() {
    instructionGroups = [...instructionGroups, createInstructionGroup()];
  }

  function removeInstructionGroup(groupIndex: number) {
    if (instructionGroups.length > 1) {
      instructionGroups = instructionGroups.filter((_, i) => i !== groupIndex);
    }
  }

  // ---------------------------------------------------------------------------
  // Multi-select helpers
  // ---------------------------------------------------------------------------

  const MEAL_TYPE_OPTIONS = [
    "Breakfast",
    "Lunch",
    "Dinner",
    "Snack",
    "Dessert",
    "Drink",
    "Condiment",
    "Side",
  ] as const;

  const SEASON_OPTIONS = ["Spring", "Summer", "Autumn", "Winter", "Holiday"] as const;

  const CUISINE_OPTIONS = [
    "American",
    "Chinese",
    "French",
    "Greek",
    "Indian",
    "Italian",
    "Japanese",
    "Korean",
    "Mediterranean",
    "Mexican",
    "Middle Eastern",
    "Thai",
    "Vietnamese",
  ] as const;

  function toggleMealType(mt: string) {
    if (mealTypes.includes(mt)) {
      mealTypes = mealTypes.filter((m) => m !== mt);
    } else {
      mealTypes = [...mealTypes, mt];
    }
  }

  function toggleSeason(s: string) {
    if (seasons.includes(s)) {
      seasons = seasons.filter((x) => x !== s);
    } else {
      seasons = [...seasons, s];
    }
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function hasAtLeastOneIngredient(): boolean {
    return ingredientGroups.some((g) => g.ingredients.some((ing) => ing.item.trim() !== ""));
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (!title.trim()) {
      error = "Title is required.";
      return;
    }

    if (!hasAtLeastOneIngredient()) {
      error = "At least one ingredient is required.";
      return;
    }

    submitting = true;
    error = null;

    try {
      // Build ingredient groups, filtering out empty entries
      const filteredIngredientGroups = ingredientGroups
        .map((g) => ({
          label: g.label.trim() || null,
          ingredients: g.ingredients
            .filter((ing) => ing.item.trim() !== "")
            .map((ing) => ({
              quantity: ing.quantity.trim() || null,
              unit: ing.unit.trim() || null,
              item: ing.item.trim(),
              notes: ing.notes.trim() || null,
            })),
        }))
        .filter((g) => g.ingredients.length > 0);

      // Build instruction groups, filtering out empty entries
      const filteredInstructionGroups = instructionGroups
        .map((g) => ({
          label: g.label.trim() || null,
          instructions: g.instructions
            .filter((inst) => inst.body.trim() !== "")
            .map((inst) => ({
              body: inst.body.trim(),
            })),
        }))
        .filter((g) => g.instructions.length > 0);

      const input: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        timing: {
          prep_minutes: prepMinutes ? parseInt(prepMinutes, 10) : null,
          cook_minutes: cookMinutes ? parseInt(cookMinutes, 10) : null,
          total_minutes: null,
        },
        notes: notes.trim() || null,
        cuisine: cuisine.trim() || null,
        mealTypes,
        seasons,
        ingredientGroups: filteredIngredientGroups,
        instructionGroups: filteredInstructionGroups,
      };

      if (yieldQuantity) {
        input["yield"] = {
          quantity: parseInt(yieldQuantity, 10),
          unit: yieldUnit,
        };
      }

      await recipes.update(recipeId, input);
      await goto(`/library/${recipeId}`);
    } catch (e) {
      error = "Failed to update recipe. Please try again.";
      console.error(e);
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Edit Recipe - dough</title>
</svelte:head>

<div class="edit-recipe-page">
  <div class="page-header">
    <a href="/library/{recipeId}" class="back-link">&larr; Back to Recipe</a>
    <h1>Edit Recipe</h1>
  </div>

  {#if loadError}
    <div class="error-banner">{loadError}</div>
  {/if}

  {#if loadingRecipe}
    <div class="loading">Loading recipe...</div>
  {:else}
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    <form class="recipe-form" onsubmit={handleSubmit}>
      <!-- Title & Description -->
      <div class="form-section">
        <div class="form-group">
          <label for="title">Title *</label>
          <input id="title" type="text" bind:value={title} placeholder="Recipe title" required />
        </div>

        <div class="form-group">
          <label for="description">Description</label>
          <textarea
            id="description"
            bind:value={description}
            placeholder="A brief description of the recipe"
            rows="3"
          ></textarea>
        </div>
      </div>

      <!-- Ingredients -->
      <div class="form-section">
        <div class="section-header">
          <h2>Ingredients *</h2>
          {#if ingredientGroups.length > 0}
            <button type="button" class="btn btn-ghost" onclick={addIngredientGroup}>
              + Add Section
            </button>
          {/if}
        </div>

        {#each ingredientGroups as group, gi (group.id)}
          <div class="dynamic-group">
            {#if ingredientGroups.length > 1}
              <div class="group-header">
                <input
                  type="text"
                  bind:value={group.label}
                  placeholder="Section name (e.g., For the sauce)"
                  class="group-label-input"
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-icon"
                  onclick={() => removeIngredientGroup(gi)}
                  title="Remove section"
                >
                  &times;
                </button>
              </div>
            {/if}

            {#each group.ingredients as _ing, ii (group.ingredients[ii]?.id ?? ii)}
              <div class="ingredient-row">
                <input
                  type="text"
                  bind:value={group.ingredients[ii].quantity}
                  placeholder="Qty"
                  class="input-sm input-qty"
                />
                <input
                  type="text"
                  bind:value={group.ingredients[ii].unit}
                  placeholder="Unit"
                  class="input-sm input-unit"
                />
                <input
                  type="text"
                  bind:value={group.ingredients[ii].item}
                  placeholder="Ingredient"
                  class="input-sm input-item"
                />
                <input
                  type="text"
                  bind:value={group.ingredients[ii].notes}
                  placeholder="Notes"
                  class="input-sm input-notes"
                />
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-xs"
                    onclick={() => moveIngredient(gi, ii, -1)}
                    disabled={ii === 0}
                    title="Move up"
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-xs"
                    onclick={() => moveIngredient(gi, ii, 1)}
                    disabled={ii === group.ingredients.length - 1}
                    title="Move down"
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-xs"
                    onclick={() => removeIngredient(gi, ii)}
                    disabled={group.ingredients.length <= 1}
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              </div>
            {/each}

            <button
              type="button"
              class="btn btn-ghost add-row-btn"
              onclick={() => addIngredient(gi)}
            >
              + Add Ingredient
            </button>
          </div>
        {/each}
      </div>

      <!-- Instructions -->
      <div class="form-section">
        <div class="section-header">
          <h2>Instructions</h2>
          {#if instructionGroups.length > 0}
            <button type="button" class="btn btn-ghost" onclick={addInstructionGroup}>
              + Add Section
            </button>
          {/if}
        </div>

        {#each instructionGroups as group, gi (group.id)}
          <div class="dynamic-group">
            {#if instructionGroups.length > 1}
              <div class="group-header">
                <input
                  type="text"
                  bind:value={group.label}
                  placeholder="Section name (e.g., Make the dough)"
                  class="group-label-input"
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-icon"
                  onclick={() => removeInstructionGroup(gi)}
                  title="Remove section"
                >
                  &times;
                </button>
              </div>
            {/if}

            {#each group.instructions as _inst, ii (group.instructions[ii]?.id ?? ii)}
              <div class="instruction-row">
                <span class="step-number">{ii + 1}</span>
                <textarea
                  bind:value={group.instructions[ii].body}
                  placeholder="Describe this step..."
                  rows="2"
                  class="instruction-textarea"
                ></textarea>
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-xs"
                    onclick={() => moveInstruction(gi, ii, -1)}
                    disabled={ii === 0}
                    title="Move up"
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-xs"
                    onclick={() => moveInstruction(gi, ii, 1)}
                    disabled={ii === group.instructions.length - 1}
                    title="Move down"
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon btn-xs"
                    onclick={() => removeInstruction(gi, ii)}
                    disabled={group.instructions.length <= 1}
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              </div>
            {/each}

            <button
              type="button"
              class="btn btn-ghost add-row-btn"
              onclick={() => addInstruction(gi)}
            >
              + Add Step
            </button>
          </div>
        {/each}
      </div>

      <!-- Timing -->
      <div class="form-section">
        <h2>Timing</h2>
        <div class="form-row">
          <div class="form-group">
            <label for="prep-minutes">Prep (minutes)</label>
            <input
              id="prep-minutes"
              type="number"
              bind:value={prepMinutes}
              placeholder="0"
              min="0"
            />
          </div>
          <div class="form-group">
            <label for="cook-minutes">Cook (minutes)</label>
            <input
              id="cook-minutes"
              type="number"
              bind:value={cookMinutes}
              placeholder="0"
              min="0"
            />
          </div>
        </div>
      </div>

      <!-- Yield -->
      <div class="form-section">
        <h2>Yield</h2>
        <div class="form-row">
          <div class="form-group">
            <label for="yield-quantity">Quantity</label>
            <input
              id="yield-quantity"
              type="number"
              bind:value={yieldQuantity}
              placeholder="4"
              min="1"
            />
          </div>
          <div class="form-group">
            <label for="yield-unit">Unit</label>
            <input id="yield-unit" type="text" bind:value={yieldUnit} placeholder="servings" />
          </div>
        </div>
      </div>

      <!-- Classification -->
      <div class="form-section">
        <h2>Classification</h2>
        <div class="form-group">
          <label for="cuisine">Cuisine</label>
          <input
            id="cuisine"
            type="text"
            bind:value={cuisine}
            placeholder="e.g., Italian, Mexican"
            list="cuisine-options"
          />
          <datalist id="cuisine-options">
            {#each CUISINE_OPTIONS as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
        </div>

        <!-- Meal Types -->
        <div class="form-group">
          <span class="field-label">Meal Type</span>
          <div class="chip-select">
            {#each MEAL_TYPE_OPTIONS as mt (mt)}
              <button
                type="button"
                class="chip"
                class:chip-active={mealTypes.includes(mt)}
                onclick={() => toggleMealType(mt)}
              >
                {mt}
              </button>
            {/each}
          </div>
        </div>

        <!-- Seasons -->
        <div class="form-group">
          <span class="field-label">Season</span>
          <div class="chip-select">
            {#each SEASON_OPTIONS as s (s)}
              <button
                type="button"
                class="chip"
                class:chip-active={seasons.includes(s)}
                onclick={() => toggleSeason(s)}
              >
                {s}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="form-section">
        <div class="form-group">
          <label for="notes">Notes</label>
          <textarea id="notes" bind:value={notes} placeholder="Additional notes" rows="3"
          ></textarea>
        </div>
      </div>

      <!-- Actions -->
      <div class="form-actions">
        <a href="/library/{recipeId}" class="btn">Cancel</a>
        <button type="submit" class="btn btn-primary" disabled={submitting}>
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .edit-recipe-page {
    max-width: 720px;
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
    display: inline-block;
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .recipe-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .form-section h2 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .section-header h2 {
    margin-bottom: 0;
  }

  .form-group {
    margin-bottom: var(--space-4);
  }

  .form-row {
    display: flex;
    gap: var(--space-4);
  }

  .form-row .form-group {
    flex: 1;
  }

  /* Dynamic groups */
  .dynamic-group {
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .group-label-input {
    flex: 1;
    font-weight: 500;
    background: transparent;
    border: 1px dashed var(--color-border);
  }

  .group-label-input:focus {
    border-style: solid;
  }

  /* Ingredient rows */
  .ingredient-row {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    margin-bottom: var(--space-2);
  }

  .input-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
  }

  .input-qty {
    width: 60px;
    flex-shrink: 0;
  }

  .input-unit {
    width: 80px;
    flex-shrink: 0;
  }

  .input-item {
    flex: 2;
    min-width: 0;
  }

  .input-notes {
    flex: 1;
    min-width: 0;
  }

  .row-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    align-items: center;
  }

  .btn-icon {
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base);
  }

  .btn-xs {
    width: 24px;
    height: 24px;
    font-size: var(--font-size-xs);
  }

  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
  }

  .add-row-btn {
    margin-top: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-primary);
  }

  /* Instruction rows */
  .instruction-row {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    margin-bottom: var(--space-2);
  }

  .step-number {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-radius: 50%;
    font-size: var(--font-size-sm);
    font-weight: 600;
    flex-shrink: 0;
    margin-top: var(--space-1);
  }

  .instruction-textarea {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-sm);
    resize: vertical;
  }

  .field-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
    color: var(--color-text);
  }

  /* Chip select */
  .chip-select {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-xl);
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .chip:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .chip-active {
    background: var(--color-primary);
    color: var(--color-primary-text);
    border-color: var(--color-primary);
  }

  .chip-active:hover {
    background: var(--color-primary-hover);
    border-color: var(--color-primary-hover);
    color: var(--color-primary-text);
  }

  /* Actions */
  .form-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-light);
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
    .ingredient-row {
      flex-wrap: wrap;
    }

    .input-qty {
      width: 50px;
    }

    .input-unit {
      width: 70px;
    }

    .input-notes {
      flex-basis: 100%;
    }

    .form-row {
      flex-direction: column;
      gap: 0;
    }
  }
</style>
