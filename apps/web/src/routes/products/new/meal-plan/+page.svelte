<script lang="ts">
  import { goto } from "$app/navigation";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import type { Recipe } from "@dough/shared";
  import { recipes as recipesApi, products } from "$lib/api.js";
  import WizardSteps from "$lib/components/WizardSteps.svelte";
  import RecipePicker from "$lib/components/RecipePicker.svelte";

  const STEPS = ["Duration", "Assign Recipes", "Shopping List", "Details", "Create"];
  const DURATION_OPTIONS = [5, 7, 14, 28] as const;
  const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snacks"] as const;
  type MealSlot = (typeof MEAL_SLOTS)[number];

  const MEAL_LABELS: Record<MealSlot, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snacks: "Snacks",
  };

  let step = $state(1);
  let error = $state<string | null>(null);
  let creating = $state(false);

  // Step 1: Duration
  let duration = $state(7);

  // Step 2: Day grid
  interface DayPlan {
    day_number: number;
    breakfast: string | null;
    lunch: string | null;
    dinner: string | null;
    snacks: string[];
  }

  let days = $state<DayPlan[]>([]);
  const recipeDetails = new SvelteMap<string, Recipe>();
  let showPicker = $state(false);
  let pickerTarget = $state<{ day: number; slot: MealSlot } | null>(null);

  // Step 4: Details
  let title = $state("");
  let description = $state("");
  let brandKitId = $state("default");
  const templateId = $state("ebook-basic");

  // Shopping list preview (Step 3)
  interface ShoppingSection {
    label: string;
    items: { item: string; recipe_refs: string[] }[];
  }
  let shoppingPreview = $state<ShoppingSection[]>([]);

  function initDays() {
    const newDays: DayPlan[] = [];
    for (let i = 1; i <= duration; i++) {
      newDays.push({
        day_number: i,
        breakfast: null,
        lunch: null,
        dinner: null,
        snacks: [],
      });
    }
    days = newDays;
  }

  // Gather all unique recipe IDs from the grid
  const allAssignedIds = $derived.by(() => {
    const ids = new SvelteSet<string>();
    for (const day of days) {
      if (day.breakfast !== null) ids.add(day.breakfast);
      if (day.lunch !== null) ids.add(day.lunch);
      if (day.dinner !== null) ids.add(day.dinner);
      for (const s of day.snacks) ids.add(s);
    }
    return ids;
  });

  async function fetchRecipeDetails(ids: string[]) {
    for (const id of ids) {
      if (!recipeDetails.has(id)) {
        try {
          const recipe = await recipesApi.get(id);
          recipeDetails.set(id, recipe);
        } catch {
          // skip
        }
      }
    }
  }

  function openSlotPicker(dayIndex: number, slot: MealSlot) {
    pickerTarget = { day: dayIndex, slot };
    showPicker = true;
  }

  function handleSlotRecipeSelect(ids: string[]) {
    showPicker = false;
    if (!pickerTarget || ids.length === 0) return;

    const { day, slot } = pickerTarget;
    const updated = [...days];
    const dayPlan = updated[day];
    if (!dayPlan) return;

    const selectedId = ids[0];
    if (!selectedId) return;

    if (slot === "snacks") {
      updated[day] = { ...dayPlan, snacks: [...dayPlan.snacks, selectedId] };
    } else {
      updated[day] = { ...dayPlan, [slot]: selectedId };
    }

    days = updated;
    pickerTarget = null;
    void fetchRecipeDetails([selectedId]);
  }

  function clearSlot(dayIndex: number, slot: MealSlot, snackIndex?: number) {
    const updated = [...days];
    const dayPlan = updated[dayIndex];
    if (!dayPlan) return;

    if (slot === "snacks" && snackIndex !== undefined) {
      updated[dayIndex] = {
        ...dayPlan,
        snacks: dayPlan.snacks.filter((_, i) => i !== snackIndex),
      };
    } else if (slot !== "snacks") {
      updated[dayIndex] = { ...dayPlan, [slot]: null };
    }

    days = updated;
  }

  function buildShoppingPreview() {
    // Simple client-side grouping of ingredients from assigned recipes
    const sectionMap = new SvelteMap<string, SvelteMap<string, SvelteSet<string>>>();

    for (const id of allAssignedIds) {
      const recipe = recipeDetails.get(id);
      if (!recipe) continue;
      for (const group of recipe.ingredients) {
        for (const ing of group.items) {
          const sectionLabel = group.label ?? "Other";
          let section = sectionMap.get(sectionLabel);
          if (!section) {
            section = new SvelteMap();
            sectionMap.set(sectionLabel, section);
          }
          const key = ing.item.toLowerCase();
          let refs = section.get(key);
          if (!refs) {
            refs = new SvelteSet();
            section.set(key, refs);
          }
          refs.add(recipe.title);
        }
      }
    }

    const result: ShoppingSection[] = [];
    for (const [label, items] of sectionMap) {
      const sectionItems: { item: string; recipe_refs: string[] }[] = [];
      for (const [item, refs] of items) {
        sectionItems.push({ item, recipe_refs: Array.from(refs) });
      }
      result.push({ label, items: sectionItems });
    }

    shoppingPreview = result;
  }

  function getRecipeName(id: string | null): string {
    if (id === null) return "";
    return recipeDetails.get(id)?.title ?? "Loading...";
  }

  // Navigation
  function nextStep() {
    error = null;
    if (step === 1) {
      initDays();
    }
    if (step === 2 && allAssignedIds.size === 0) {
      error = "Assign at least one recipe to the meal plan.";
      return;
    }
    if (step === 2) {
      buildShoppingPreview();
    }
    if (step === 4 && !title.trim()) {
      error = "Title is required.";
      return;
    }
    if (step < STEPS.length) step += 1;
  }

  function prevStep() {
    error = null;
    if (step > 1) step -= 1;
  }

  async function handleCreate() {
    if (!title.trim()) {
      error = "Title is required.";
      return;
    }
    creating = true;
    error = null;
    try {
      const product = await products.createMealPlan({
        title: title.trim(),
        description: description.trim() || null,
        brand_kit_id: brandKitId,
        template_id: templateId,
        days: days.map((d) => ({
          day_number: d.day_number,
          breakfast: d.breakfast,
          lunch: d.lunch,
          dinner: d.dinner,
          snacks: d.snacks,
        })),
        suggested_price_cents: null,
      });
      await goto(`/products/${product.base.id}`);
    } catch (e) {
      error = "Failed to create meal plan. Please try again.";
      console.error(e);
    } finally {
      creating = false;
    }
  }
</script>

<svelte:head>
  <title>New Meal Plan - dough</title>
</svelte:head>

<div class="wizard-page">
  <a href="/products" class="back-link">&larr; Back to Products</a>
  <h1>Create Meal Plan</h1>

  <WizardSteps steps={STEPS} currentStep={step} />

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  <!-- Step 1: Duration -->
  {#if step === 1}
    <div class="step-content">
      <h2>Plan Duration</h2>
      <p class="step-desc">How many days should this meal plan cover?</p>

      <div class="duration-options">
        {#each DURATION_OPTIONS as opt (opt)}
          <button
            type="button"
            class="duration-btn"
            class:selected={duration === opt}
            onclick={() => (duration = opt)}
          >
            <span class="duration-num">{opt}</span>
            <span class="duration-label">days</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Step 2: Assign Recipes -->
  {:else if step === 2}
    <div class="step-content">
      <h2>Assign Recipes</h2>
      <p class="step-desc">Click a slot to assign a recipe from your library.</p>

      <div class="meal-grid-container">
        <div class="meal-grid">
          <!-- Header row -->
          <div class="grid-header grid-cell">Day</div>
          {#each MEAL_SLOTS as slot (slot)}
            <div class="grid-header grid-cell">{MEAL_LABELS[slot]}</div>
          {/each}

          <!-- Day rows -->
          {#each days as day, di (day.day_number)}
            <div class="grid-day-label grid-cell">Day {day.day_number}</div>

            <!-- Breakfast -->
            <div class="grid-cell meal-cell">
              {#if day.breakfast}
                <div class="meal-assigned">
                  <span class="meal-name">{getRecipeName(day.breakfast)}</span>
                  <button
                    class="meal-clear"
                    onclick={() => clearSlot(di, "breakfast")}
                    aria-label="Clear">&times;</button
                  >
                </div>
              {:else}
                <button class="meal-empty" onclick={() => openSlotPicker(di, "breakfast")}>+</button
                >
              {/if}
            </div>

            <!-- Lunch -->
            <div class="grid-cell meal-cell">
              {#if day.lunch}
                <div class="meal-assigned">
                  <span class="meal-name">{getRecipeName(day.lunch)}</span>
                  <button
                    class="meal-clear"
                    onclick={() => clearSlot(di, "lunch")}
                    aria-label="Clear">&times;</button
                  >
                </div>
              {:else}
                <button class="meal-empty" onclick={() => openSlotPicker(di, "lunch")}>+</button>
              {/if}
            </div>

            <!-- Dinner -->
            <div class="grid-cell meal-cell">
              {#if day.dinner}
                <div class="meal-assigned">
                  <span class="meal-name">{getRecipeName(day.dinner)}</span>
                  <button
                    class="meal-clear"
                    onclick={() => clearSlot(di, "dinner")}
                    aria-label="Clear">&times;</button
                  >
                </div>
              {:else}
                <button class="meal-empty" onclick={() => openSlotPicker(di, "dinner")}>+</button>
              {/if}
            </div>

            <!-- Snacks -->
            <div class="grid-cell meal-cell snack-cell">
              {#each day.snacks as snack, si (si)}
                <div class="meal-assigned">
                  <span class="meal-name">{getRecipeName(snack)}</span>
                  <button
                    class="meal-clear"
                    onclick={() => clearSlot(di, "snacks", si)}
                    aria-label="Remove">&times;</button
                  >
                </div>
              {/each}
              <button class="meal-empty" onclick={() => openSlotPicker(di, "snacks")}>+</button>
            </div>
          {/each}
        </div>
      </div>
    </div>

    {#if showPicker}
      <RecipePicker
        multi={false}
        onSelect={handleSlotRecipeSelect}
        onClose={() => {
          showPicker = false;
          pickerTarget = null;
        }}
      />
    {/if}

    <!-- Step 3: Shopping List Preview -->
  {:else if step === 3}
    <div class="step-content">
      <h2>Shopping List Preview</h2>
      <p class="step-desc">
        Auto-generated shopping list based on assigned recipes. This is a read-only preview.
      </p>

      {#if shoppingPreview.length === 0}
        <p class="empty-shopping">
          No ingredients to display. Assign recipes to generate a shopping list.
        </p>
      {:else}
        {#each shoppingPreview as section (section.label)}
          <div class="shopping-section">
            <h3>{section.label}</h3>
            <ul>
              {#each section.items as item (item.item)}
                <li>
                  <span class="shopping-item-name">{item.item}</span>
                  {#if item.recipe_refs.length > 0}
                    <span class="shopping-refs">
                      ({item.recipe_refs.join(", ")})
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Step 4: Details -->
  {:else if step === 4}
    <div class="step-content">
      <h2>Meal Plan Details</h2>
      <p class="step-desc">Add a title and description for your meal plan.</p>

      <div class="form-group">
        <label for="mp-title">Title *</label>
        <input
          id="mp-title"
          type="text"
          bind:value={title}
          placeholder="Weekly Meal Plan"
          required
        />
      </div>

      <div class="form-group">
        <label for="mp-desc">Description</label>
        <textarea
          id="mp-desc"
          bind:value={description}
          placeholder="A balanced meal plan..."
          rows="3"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="mp-brand">Brand Kit</label>
        <select id="mp-brand" bind:value={brandKitId}>
          <option value="default">Default Brand Kit</option>
        </select>
      </div>
    </div>

    <!-- Step 5: Create -->
  {:else if step === 5}
    <div class="step-content">
      <h2>Review & Create</h2>
      <p class="step-desc">Review your meal plan before creating it.</p>

      <div class="review-section card">
        <h3>{title || "Untitled"}</h3>
        {#if description}
          <p class="review-desc">{description}</p>
        {/if}

        <div class="review-meta">
          <div class="review-item">
            <span class="review-label">Duration</span>
            <span>{days.length} days</span>
          </div>
          <div class="review-item">
            <span class="review-label">Unique Recipes</span>
            <span>{allAssignedIds.size}</span>
          </div>
          <div class="review-item">
            <span class="review-label">Shopping Items</span>
            <span>{shoppingPreview.reduce((sum, s) => sum + s.items.length, 0)}</span>
          </div>
        </div>

        <h4>Schedule</h4>
        <div class="review-schedule">
          {#each days as day (day.day_number)}
            <div class="review-day">
              <strong>Day {day.day_number}</strong>
              <ul>
                {#if day.breakfast}
                  <li>Breakfast: {getRecipeName(day.breakfast)}</li>
                {/if}
                {#if day.lunch}
                  <li>Lunch: {getRecipeName(day.lunch)}</li>
                {/if}
                {#if day.dinner}
                  <li>Dinner: {getRecipeName(day.dinner)}</li>
                {/if}
                {#each day.snacks as snack (snack)}
                  <li>Snack: {getRecipeName(snack)}</li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Navigation -->
  <div class="wizard-nav">
    {#if step > 1}
      <button class="btn" onclick={prevStep}>Back</button>
    {:else}
      <div></div>
    {/if}

    {#if step < STEPS.length}
      <button class="btn btn-primary" onclick={nextStep}>Continue</button>
    {:else}
      <button class="btn btn-primary" disabled={creating} onclick={handleCreate}>
        {creating ? "Creating..." : "Create Meal Plan"}
      </button>
    {/if}
  </div>
</div>

<style>
  .wizard-page {
    max-width: 960px;
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .wizard-page > h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-6);
  }

  .step-content {
    margin-bottom: var(--space-8);
  }

  .step-content h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-1);
  }

  .step-desc {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-6);
  }

  .error-banner {
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-danger, #ef4444);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  /* Step 1: Duration */
  .duration-options {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .duration-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 100px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .duration-btn:hover {
    border-color: var(--color-primary);
  }

  .duration-btn.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .duration-num {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--color-text);
  }

  .duration-btn.selected .duration-num {
    color: var(--color-primary);
  }

  .duration-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  /* Step 2: Meal Grid */
  .meal-grid-container {
    overflow-x: auto;
  }

  .meal-grid {
    display: grid;
    grid-template-columns: 80px repeat(4, 1fr);
    gap: 1px;
    background: var(--color-border-light);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    min-width: 600px;
  }

  .grid-cell {
    background: var(--color-surface);
    padding: var(--space-2);
  }

  .grid-header {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    text-align: center;
    background: var(--color-bg-secondary);
    padding: var(--space-2) var(--space-3);
  }

  .grid-day-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
  }

  .meal-cell {
    min-height: 56px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .meal-empty {
    width: 100%;
    min-height: 40px;
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    font-size: var(--font-size-lg);
    color: var(--color-text-muted);
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .meal-empty:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .meal-assigned {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: var(--color-primary-light);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .meal-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .meal-clear {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    flex-shrink: 0;
    line-height: 1;
    padding: 0 2px;
  }

  .meal-clear:hover {
    color: var(--color-danger, #ef4444);
  }

  .snack-cell {
    align-items: stretch;
  }

  /* Step 3: Shopping List */
  .empty-shopping {
    text-align: center;
    padding: var(--space-8);
    color: var(--color-text-secondary);
  }

  .shopping-section {
    margin-bottom: var(--space-6);
  }

  .shopping-section h3 {
    font-size: var(--font-size-base);
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--color-border-light);
  }

  .shopping-section ul {
    list-style: none;
    padding: 0;
  }

  .shopping-section li {
    padding: var(--space-1) 0;
    font-size: var(--font-size-sm);
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .shopping-refs {
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
  }

  /* Step 4: Details */
  .form-group {
    margin-bottom: var(--space-5);
  }

  .form-group label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
  }

  .form-group textarea {
    width: 100%;
    resize: vertical;
  }

  /* Step 5: Review */
  .review-section h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-1);
  }

  .review-desc {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-4);
  }

  .review-meta {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .review-item {
    display: flex;
    flex-direction: column;
  }

  .review-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }

  .review-schedule {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .review-day {
    font-size: var(--font-size-sm);
  }

  .review-day ul {
    padding-left: var(--space-4);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  /* Wizard Navigation */
  .wizard-nav {
    display: flex;
    justify-content: space-between;
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-border-light);
  }

  @media (max-width: 768px) {
    .duration-options {
      justify-content: center;
    }

    .meal-grid-container {
      margin: 0 calc(-1 * var(--space-4));
      padding: 0 var(--space-4);
    }
  }
</style>
