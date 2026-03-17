<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { Recipe, Collection } from "@dough/shared";
  import { recipes as recipesApi, collections as collectionsApi, products } from "$lib/api.js";
  import WizardSteps from "$lib/components/WizardSteps.svelte";
  import RecipePicker from "$lib/components/RecipePicker.svelte";

  const STEPS = ["Select Recipes", "Organize Chapters", "Copy", "Template & Brand", "Review"];

  let step = $state(1);
  let error = $state<string | null>(null);
  let creating = $state(false);

  // Step 1: Recipe selection
  let selectedRecipeIds = $state<string[]>([]);
  const recipeDetails = new SvelteMap<string, Recipe>();
  let showPicker = $state(false);
  let collectionList = $state<Collection[]>([]);
  let selectedCollectionId = $state("");

  // Step 2: Chapters
  let chapters = $state<{ title: string; intro_copy: string; recipe_ids: string[] }[]>([
    { title: "Chapter 1", intro_copy: "", recipe_ids: [] },
  ]);

  // Step 3: Copy
  let title = $state("");
  let description = $state("");
  let introCopy = $state("");
  let authorBio = $state("");

  // Step 4: Template & Brand
  let templateId = $state("ebook-basic");
  let brandKitId = $state("default");
  let format = $state("LetterSize");

  onMount(async () => {
    try {
      collectionList = await collectionsApi.list();
    } catch (e) {
      console.error("Failed to load collections:", e);
    }
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

  function handleRecipeSelect(ids: string[]) {
    selectedRecipeIds = ids;
    showPicker = false;
    void fetchRecipeDetails(ids);
  }

  async function handleLoadCollection() {
    if (!selectedCollectionId) return;
    try {
      const col = await collectionsApi.get(selectedCollectionId);
      const ids = [...col.recipe_ids] as string[];
      selectedRecipeIds = ids;
      void fetchRecipeDetails(ids);
    } catch (e) {
      console.error("Failed to load collection recipes:", e);
    }
  }

  function removeSelectedRecipe(id: string) {
    selectedRecipeIds = selectedRecipeIds.filter((r) => r !== id);
  }

  // Chapter management
  function addChapter() {
    chapters = [
      ...chapters,
      { title: `Chapter ${chapters.length + 1}`, intro_copy: "", recipe_ids: [] },
    ];
  }

  function removeChapter(index: number) {
    if (chapters.length <= 1) return;
    chapters = chapters.filter((_, i) => i !== index);
  }

  function addRecipeToChapter(chapterIndex: number, recipeId: string) {
    const updated = [...chapters];
    const chapter = updated[chapterIndex];
    if (chapter && !chapter.recipe_ids.includes(recipeId)) {
      updated[chapterIndex] = { ...chapter, recipe_ids: [...chapter.recipe_ids, recipeId] };
      chapters = updated;
    }
  }

  function removeRecipeFromChapter(chapterIndex: number, recipeId: string) {
    const updated = [...chapters];
    const chapter = updated[chapterIndex];
    if (chapter) {
      updated[chapterIndex] = {
        ...chapter,
        recipe_ids: chapter.recipe_ids.filter((r) => r !== recipeId),
      };
      chapters = updated;
    }
  }

  // Unassigned recipes for drag pool
  const assignedRecipeIds = $derived(new Set(chapters.flatMap((c) => c.recipe_ids)));
  const unassignedRecipes = $derived(selectedRecipeIds.filter((id) => !assignedRecipeIds.has(id)));

  // Navigation
  function nextStep() {
    error = null;
    if (step === 1 && selectedRecipeIds.length === 0) {
      error = "Select at least one recipe.";
      return;
    }
    if (step === 2) {
      // Auto-assign unassigned recipes to first chapter
      if (unassignedRecipes.length > 0 && chapters[0]) {
        const updated = [...chapters];
        const first = updated[0];
        if (first) {
          updated[0] = { ...first, recipe_ids: [...first.recipe_ids, ...unassignedRecipes] };
          chapters = updated;
        }
      }
    }
    if (step === 3 && !title.trim()) {
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
      const product = await products.createEbook({
        title: title.trim(),
        description: description.trim() || null,
        brand_kit_id: brandKitId,
        template_id: templateId,
        recipe_ids: selectedRecipeIds,
        chapters: chapters.map((c) => ({
          title: c.title,
          intro_copy: c.intro_copy.trim() || null,
          recipe_ids: c.recipe_ids,
        })),
        intro_copy: introCopy.trim() || null,
        author_bio: authorBio.trim() || null,
        format,
        suggested_price_cents: null,
      });
      await goto(`/products/${product.base.id}`);
    } catch (e) {
      error = "Failed to create ebook. Please try again.";
      console.error(e);
    } finally {
      creating = false;
    }
  }

  function getRecipeName(id: string): string {
    return recipeDetails.get(id)?.title ?? "Loading...";
  }
</script>

<svelte:head>
  <title>New Ebook - dough</title>
</svelte:head>

<div class="wizard-page">
  <a href="/products" class="back-link">&larr; Back to Products</a>
  <h1>Create Ebook</h1>

  <WizardSteps steps={STEPS} currentStep={step} />

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  <!-- Step 1: Select Recipes -->
  {#if step === 1}
    <div class="step-content">
      <h2>Select Recipes</h2>
      <p class="step-desc">Choose recipes from your library or load from a collection.</p>

      <div class="collection-selector">
        <select bind:value={selectedCollectionId}>
          <option value="">Load from collection...</option>
          {#each collectionList as col (col.id)}
            <option value={col.id}>{col.name} ({col.recipe_ids.length} recipes)</option>
          {/each}
        </select>
        <button class="btn" disabled={!selectedCollectionId} onclick={handleLoadCollection}>
          Load
        </button>
      </div>

      <button class="btn btn-primary" onclick={() => (showPicker = true)}>
        Pick Recipes from Library
      </button>

      {#if selectedRecipeIds.length > 0}
        <div class="selected-recipes">
          <h3>
            {selectedRecipeIds.length} recipe{selectedRecipeIds.length === 1 ? "" : "s"} selected
          </h3>
          <ul class="recipe-tag-list">
            {#each selectedRecipeIds as id (id)}
              <li class="recipe-tag">
                <span>{getRecipeName(id)}</span>
                <button
                  class="tag-remove"
                  onclick={() => removeSelectedRecipe(id)}
                  aria-label="Remove">&times;</button
                >
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if showPicker}
        <RecipePicker
          selectedIds={selectedRecipeIds}
          onSelect={handleRecipeSelect}
          onClose={() => (showPicker = false)}
        />
      {/if}
    </div>

    <!-- Step 2: Organize Chapters -->
  {:else if step === 2}
    <div class="step-content">
      <h2>Organize Chapters</h2>
      <p class="step-desc">
        Group your recipes into chapters. Unassigned recipes will be placed in the first chapter.
      </p>

      {#if unassignedRecipes.length > 0}
        <div class="unassigned-pool">
          <h4>Unassigned ({unassignedRecipes.length})</h4>
          <div class="recipe-chips">
            {#each unassignedRecipes as id (id)}
              <span class="recipe-chip">{getRecipeName(id)}</span>
            {/each}
          </div>
        </div>
      {/if}

      {#each chapters as chapter, ci (ci)}
        <div class="chapter-card card">
          <div class="chapter-header">
            <input
              type="text"
              bind:value={chapter.title}
              placeholder="Chapter title"
              class="chapter-title-input"
            />
            {#if chapters.length > 1}
              <button
                class="btn-icon btn-icon-danger"
                onclick={() => removeChapter(ci)}
                aria-label="Remove chapter"
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
            {/if}
          </div>

          <div class="chapter-recipes">
            {#each chapter.recipe_ids as recipeId (recipeId)}
              <div class="chapter-recipe-row">
                <span>{getRecipeName(recipeId)}</span>
                <button
                  class="tag-remove"
                  onclick={() => removeRecipeFromChapter(ci, recipeId)}
                  aria-label="Remove">&times;</button
                >
              </div>
            {/each}
          </div>

          {#if unassignedRecipes.length > 0}
            <div class="add-to-chapter">
              <select
                onchange={(e) => {
                  const target = e.target as HTMLSelectElement;
                  if (target.value) {
                    addRecipeToChapter(ci, target.value);
                    target.value = "";
                  }
                }}
              >
                <option value="">Add recipe to this chapter...</option>
                {#each unassignedRecipes as id (id)}
                  <option value={id}>{getRecipeName(id)}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      {/each}

      <button class="btn" onclick={addChapter}>+ Add Chapter</button>
    </div>

    <!-- Step 3: Copy -->
  {:else if step === 3}
    <div class="step-content">
      <h2>Ebook Details</h2>
      <p class="step-desc">Add the title, description, and copy for your ebook.</p>

      <div class="form-group">
        <label for="ebook-title">Title *</label>
        <input
          id="ebook-title"
          type="text"
          bind:value={title}
          placeholder="My Recipe Ebook"
          required
        />
      </div>

      <div class="form-group">
        <label for="ebook-desc">Description</label>
        <textarea
          id="ebook-desc"
          bind:value={description}
          placeholder="A brief description..."
          rows="3"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="ebook-intro">Introduction Copy</label>
        <textarea
          id="ebook-intro"
          bind:value={introCopy}
          placeholder="Welcome to this collection..."
          rows="4"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="ebook-bio">Author Bio</label>
        <textarea id="ebook-bio" bind:value={authorBio} placeholder="About the author..." rows="3"
        ></textarea>
      </div>
    </div>

    <!-- Step 4: Template & Brand -->
  {:else if step === 4}
    <div class="step-content">
      <h2>Template & Brand</h2>
      <p class="step-desc">Choose a template and format for your ebook.</p>

      <div class="form-group">
        <label for="ebook-template">Template</label>
        <div class="template-options">
          <label class="template-option" class:selected={templateId === "ebook-basic"}>
            <input type="radio" name="template" value="ebook-basic" bind:group={templateId} />
            <div class="template-preview">
              <div class="template-thumb basic"></div>
              <span>Basic</span>
              <span class="template-desc">Clean, minimal layout</span>
            </div>
          </label>
          <label class="template-option" class:selected={templateId === "ebook-modern"}>
            <input type="radio" name="template" value="ebook-modern" bind:group={templateId} />
            <div class="template-preview">
              <div class="template-thumb modern"></div>
              <span>Modern</span>
              <span class="template-desc">Bold headers, photo-focused</span>
            </div>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label for="ebook-format">Format</label>
        <select id="ebook-format" bind:value={format}>
          <option value="LetterSize">Letter Size (8.5" x 11")</option>
          <option value="TradeSize">Trade Size (6" x 9")</option>
        </select>
      </div>

      <div class="form-group">
        <label for="ebook-brand">Brand Kit</label>
        <select id="ebook-brand" bind:value={brandKitId}>
          <option value="default">Default Brand Kit</option>
        </select>
      </div>
    </div>

    <!-- Step 5: Review & Create -->
  {:else if step === 5}
    <div class="step-content">
      <h2>Review & Create</h2>
      <p class="step-desc">Review your ebook before creating it.</p>

      <div class="review-section card">
        <h3>{title || "Untitled"}</h3>
        {#if description}
          <p class="review-desc">{description}</p>
        {/if}

        <div class="review-meta">
          <div class="review-item">
            <span class="review-label">Recipes</span>
            <span>{selectedRecipeIds.length}</span>
          </div>
          <div class="review-item">
            <span class="review-label">Chapters</span>
            <span>{chapters.length}</span>
          </div>
          <div class="review-item">
            <span class="review-label">Template</span>
            <span>{templateId === "ebook-basic" ? "Basic" : "Modern"}</span>
          </div>
          <div class="review-item">
            <span class="review-label">Format</span>
            <span>{format === "LetterSize" ? "Letter Size" : "Trade Size"}</span>
          </div>
        </div>

        <h4>Chapters</h4>
        {#each chapters as chapter, i (i)}
          <div class="review-chapter">
            <strong>{chapter.title}</strong>
            <span class="review-chapter-count">
              ({chapter.recipe_ids.length} recipe{chapter.recipe_ids.length === 1 ? "" : "s"})
            </span>
            <ul>
              {#each chapter.recipe_ids as rid (rid)}
                <li>{getRecipeName(rid)}</li>
              {/each}
            </ul>
          </div>
        {/each}
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
        {creating ? "Creating..." : "Create Ebook"}
      </button>
    {/if}
  </div>
</div>

<style>
  .wizard-page {
    max-width: 780px;
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

  /* Step 1 */
  .collection-selector {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .collection-selector select {
    flex: 1;
    max-width: 300px;
  }

  .selected-recipes {
    margin-top: var(--space-6);
  }

  .selected-recipes h3 {
    font-size: var(--font-size-base);
    margin-bottom: var(--space-3);
  }

  .recipe-tag-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .recipe-tag {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-xl);
    font-size: var(--font-size-sm);
  }

  .tag-remove {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
    padding: 0 2px;
    line-height: 1;
  }

  .tag-remove:hover {
    color: var(--color-danger, #ef4444);
  }

  /* Step 2 */
  .unassigned-pool {
    margin-bottom: var(--space-6);
    padding: var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .unassigned-pool h4 {
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-2);
  }

  .recipe-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .recipe-chip {
    padding: var(--space-1) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    font-size: var(--font-size-xs);
  }

  .chapter-card {
    margin-bottom: var(--space-4);
  }

  .chapter-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .chapter-title-input {
    flex: 1;
    font-weight: 600;
  }

  .chapter-recipes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }

  .chapter-recipe-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  .add-to-chapter select {
    width: 100%;
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
    flex-shrink: 0;
  }

  .btn-icon:hover {
    background: var(--color-bg-secondary);
  }

  .btn-icon-danger:hover {
    color: var(--color-danger, #ef4444);
    border-color: var(--color-danger, #ef4444);
  }

  /* Step 3 */
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

  /* Step 4 */
  .template-options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-4);
  }

  .template-option {
    cursor: pointer;
  }

  .template-option input {
    display: none;
  }

  .template-preview {
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    text-align: center;
    transition: border-color var(--transition-fast);
  }

  .template-option.selected .template-preview {
    border-color: var(--color-primary);
  }

  .template-thumb {
    height: 80px;
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
  }

  .template-thumb.basic {
    background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
    border: 1px solid var(--color-border-light);
  }

  .template-thumb.modern {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .template-preview span {
    display: block;
    font-weight: 500;
    font-size: var(--font-size-sm);
  }

  .template-desc {
    color: var(--color-text-muted);
    font-size: var(--font-size-xs) !important;
    font-weight: 400 !important;
  }

  /* Step 5 */
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

  .review-chapter {
    margin-bottom: var(--space-3);
  }

  .review-chapter-count {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .review-chapter ul {
    padding-left: var(--space-6);
    margin-top: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Wizard Navigation */
  .wizard-nav {
    display: flex;
    justify-content: space-between;
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-border-light);
  }

  @media (max-width: 768px) {
    .collection-selector {
      flex-direction: column;
    }

    .collection-selector select {
      max-width: 100%;
    }

    .template-options {
      grid-template-columns: 1fr;
    }
  }
</style>
