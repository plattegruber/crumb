<script lang="ts">
  import { onMount } from "svelte";
  import {
    automation,
    collections as collectionsApi,
    type SeasonalDrop,
    type AutomationConfig,
  } from "$lib/api.js";
  import type { Collection } from "@dough/shared";

  let drops = $state<SeasonalDrop[]>([]);
  let config = $state<AutomationConfig | null>(null);
  let collectionsList = $state<Collection[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // New drop form state
  let showNewDropForm = $state(false);
  let newDropLabel = $state("");
  let newDropStartDate = $state("");
  let newDropEndDate = $state("");
  let newDropCollectionId = $state("");
  let newDropTargetSegment = $state("");
  let submitting = $state(false);
  let formError = $state<string | null>(null);

  onMount(async () => {
    try {
      const [dropsData, configData, colsData] = await Promise.all([
        automation.getSeasonalDrops(),
        automation.getConfig(),
        collectionsApi.list(),
      ]);
      drops = dropsData;
      config = configData;
      collectionsList = colsData;
    } catch (e) {
      error = "Failed to load automation data.";
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function dropStatus(drop: SeasonalDrop): string {
    const today = new Date().toISOString().split("T")[0] ?? "";
    if (drop.end_date < today) return "Ended";
    if (drop.start_date > today) return "Scheduled";
    return "Active";
  }

  function dropStatusClass(drop: SeasonalDrop): string {
    const status = dropStatus(drop);
    if (status === "Active") return "status-active";
    if (status === "Scheduled") return "status-scheduled";
    return "status-ended";
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function collectionName(collectionId: string): string {
    const col = collectionsList.find((c) => c.id === collectionId);
    return col ? col.name : collectionId;
  }

  async function handleCreateDrop() {
    formError = null;
    if (!newDropLabel.trim()) {
      formError = "Label is required.";
      return;
    }
    if (!newDropStartDate || !newDropEndDate) {
      formError = "Start and end dates are required.";
      return;
    }
    if (!newDropCollectionId) {
      formError = "Please select a collection.";
      return;
    }

    submitting = true;
    try {
      const newDrop = await automation.createSeasonalDrop({
        id: crypto.randomUUID(),
        label: newDropLabel.trim(),
        startDate: newDropStartDate,
        endDate: newDropEndDate,
        collectionId: newDropCollectionId,
        targetSegment: newDropTargetSegment || null,
        recurrence: "None",
      });
      drops = [...drops, newDrop];
      showNewDropForm = false;
      newDropLabel = "";
      newDropStartDate = "";
      newDropEndDate = "";
      newDropCollectionId = "";
      newDropTargetSegment = "";
    } catch (e) {
      formError = "Failed to create seasonal drop.";
      console.error(e);
    } finally {
      submitting = false;
    }
  }

  async function handleDeleteDrop(id: string) {
    try {
      await automation.deleteSeasonalDrop(id);
      drops = drops.filter((d) => d.id !== id);
    } catch (e) {
      error = "Failed to delete seasonal drop.";
      console.error(e);
    }
  }

  const dietaryTags = [
    { value: "GlutenFree", label: "Gluten-Free" },
    { value: "DairyFree", label: "Dairy-Free" },
    { value: "Vegan", label: "Vegan" },
    { value: "Vegetarian", label: "Vegetarian" },
    { value: "Keto", label: "Keto" },
    { value: "Paleo", label: "Paleo" },
    { value: "NutFree", label: "Nut-Free" },
    { value: "EggFree", label: "Egg-Free" },
    { value: "SoyFree", label: "Soy-Free" },
  ];
</script>

<svelte:head>
  <title>Automation - dough</title>
</svelte:head>

<div class="automation-page">
  <div class="page-header">
    <div>
      <h1>Automation</h1>
      <p class="page-description">
        Configure automated seasonal drops, broadcast drafts, and lead magnet sequences.
      </p>
    </div>
    <a href="/grow" class="btn btn-ghost">Back to Grow</a>
  </div>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <p class="loading">Loading automation config...</p>
  {:else}
    <!-- Seasonal Drops Section -->
    <section class="auto-section">
      <div class="section-header">
        <h2>Seasonal Drops</h2>
        {#if !showNewDropForm}
          <button class="btn btn-primary" onclick={() => (showNewDropForm = true)}>
            New Seasonal Drop
          </button>
        {/if}
      </div>

      {#if showNewDropForm}
        <div class="new-drop-form card">
          <h3>New Seasonal Drop</h3>
          {#if formError}
            <div class="form-error">{formError}</div>
          {/if}

          <div class="form-grid">
            <div class="form-field">
              <label for="drop-label">Label</label>
              <input
                id="drop-label"
                type="text"
                bind:value={newDropLabel}
                placeholder="e.g., Spring 2026 Collection"
              />
            </div>

            <div class="form-field">
              <label for="drop-start">Start Date</label>
              <input id="drop-start" type="date" bind:value={newDropStartDate} />
            </div>

            <div class="form-field">
              <label for="drop-end">End Date</label>
              <input id="drop-end" type="date" bind:value={newDropEndDate} />
            </div>

            <div class="form-field">
              <label for="drop-collection">Collection</label>
              <select id="drop-collection" bind:value={newDropCollectionId}>
                <option value="">Select a collection...</option>
                {#each collectionsList as col (col.id)}
                  <option value={col.id}>{col.name}</option>
                {/each}
              </select>
            </div>

            <div class="form-field">
              <label for="drop-segment">Target Segment (optional)</label>
              <select id="drop-segment" bind:value={newDropTargetSegment}>
                <option value="">All subscribers</option>
                {#each dietaryTags as tag (tag.value)}
                  <option value={tag.value}>{tag.label}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" onclick={handleCreateDrop} disabled={submitting}>
              {submitting ? "Creating..." : "Create Drop"}
            </button>
            <button
              class="btn"
              onclick={() => {
                showNewDropForm = false;
                formError = null;
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}

      {#if drops.length === 0 && !showNewDropForm}
        <div class="empty-state card">
          <div class="empty-icon">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </svg>
          </div>
          <h3>No seasonal drops configured</h3>
          <p>
            Create seasonal drops to automatically curate and send season-appropriate recipes to
            your subscribers. Each drop selects the highest-engagement recipe from a collection and
            creates a broadcast draft.
          </p>
        </div>
      {:else}
        <div class="drops-list">
          {#each drops as drop (drop.id)}
            <div class="drop-card card">
              <div class="drop-header">
                <div class="drop-info">
                  <span class="drop-label">{drop.label}</span>
                  <span class="drop-status {dropStatusClass(drop)}">
                    {dropStatus(drop)}
                  </span>
                </div>
                <button
                  class="btn btn-ghost btn-danger btn-sm"
                  onclick={() => handleDeleteDrop(drop.id)}
                  title="Delete drop"
                >
                  Delete
                </button>
              </div>
              <div class="drop-meta">
                <div class="drop-meta-item">
                  <span class="drop-meta-label">Dates</span>
                  <span class="drop-meta-value"
                    >{formatDate(drop.start_date)} - {formatDate(drop.end_date)}</span
                  >
                </div>
                <div class="drop-meta-item">
                  <span class="drop-meta-label">Collection</span>
                  <span class="drop-meta-value">{collectionName(drop.collection_id)}</span>
                </div>
                {#if drop.target_segment}
                  <div class="drop-meta-item">
                    <span class="drop-meta-label">Segment</span>
                    <span class="drop-meta-value">{drop.target_segment}</span>
                  </div>
                {/if}
                {#if drop.last_processed_at}
                  <div class="drop-meta-item">
                    <span class="drop-meta-label">Last processed</span>
                    <span class="drop-meta-value">{drop.last_processed_at}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Save This Recipe Section -->
    <section class="auto-section">
      <h2>Save This Recipe</h2>
      <div class="card save-recipe-config">
        {#if config !== null && config.save_recipe_sequence_id}
          <div class="config-row">
            <div>
              <span class="config-label">Default Sequence ID</span>
              <span class="config-value">{config.save_recipe_sequence_id}</span>
            </div>
            <a href="/settings/kit" class="btn">Change</a>
          </div>
          <p class="config-desc">
            When a subscriber clicks "Save This Recipe," they are enrolled in this Kit sequence. If
            the recipe belongs to a collection with a published product, the product's nurture
            sequence takes priority.
          </p>
        {:else}
          <div class="config-empty">
            <h3>No sequence configured</h3>
            <p>
              Set a default Kit sequence ID to automatically enroll subscribers when they save a
              recipe. Tags and custom fields are still applied even without a sequence.
            </p>
            <a href="/settings/kit" class="btn btn-primary">Configure Sequence</a>
          </div>
        {/if}
      </div>
    </section>

    <!-- Broadcast History Section -->
    <section class="auto-section">
      <h2>Broadcast History</h2>
      <div class="empty-state card">
        <div class="empty-icon">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        <h3>No broadcast drafts yet</h3>
        <p>
          Auto-generated broadcast drafts appear here when you publish a recipe with
          <code>email_ready</code> set to true, or when a seasonal drop is processed. Drafts are created
          in Kit for your review before sending.
        </p>
        {#if config !== null}
          <div class="sends-info">
            <span class="sends-count">{config.sends_this_month}</span>
            <span class="sends-label">broadcasts this month (Free tier: 3/mo)</span>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .automation-page {
    max-width: var(--max-content-width);
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-8);
    gap: var(--space-4);
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-1);
  }

  .page-description {
    color: var(--color-text-secondary);
  }

  .auto-section {
    margin-bottom: var(--space-10);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .section-header h2,
  .auto-section > h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-4);
  }

  .section-header h2 {
    margin-bottom: 0;
  }

  /* New drop form */
  .new-drop-form {
    margin-bottom: var(--space-4);
  }

  .new-drop-form h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .form-field {
    display: flex;
    flex-direction: column;
  }

  .form-field label {
    margin-bottom: var(--space-1);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .form-error {
    padding: var(--space-2) var(--space-3);
    background: var(--color-danger-light);
    color: var(--color-danger);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .form-actions {
    display: flex;
    gap: var(--space-2);
  }

  /* Drops list */
  .drops-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .drop-card {
    padding: var(--space-4);
  }

  .drop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .drop-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .drop-label {
    font-weight: 600;
    font-size: var(--font-size-base);
  }

  .drop-status {
    font-size: var(--font-size-xs);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }

  .status-active {
    background: var(--color-success-light);
    color: var(--color-success);
  }

  .status-scheduled {
    background: var(--color-warning-light);
    color: var(--color-warning);
  }

  .status-ended {
    background: var(--color-bg-tertiary);
    color: var(--color-text-muted);
  }

  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
  }

  .drop-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .drop-meta-item {
    display: flex;
    flex-direction: column;
  }

  .drop-meta-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .drop-meta-value {
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  /* Save recipe config */
  .save-recipe-config {
    padding: var(--space-5);
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .config-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    display: block;
  }

  .config-value {
    font-size: var(--font-size-sm);
    font-weight: 600;
    font-family: var(--font-mono);
    display: block;
    margin-top: var(--space-1);
  }

  .config-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .config-empty {
    text-align: center;
  }

  .config-empty h3 {
    font-size: var(--font-size-base);
    margin-bottom: var(--space-2);
  }

  .config-empty p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-4);
    max-width: 420px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.6;
  }

  /* Broadcast history */
  .sends-info {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-light);
  }

  .sends-count {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
  }

  .sends-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin-left: var(--space-2);
  }

  code {
    background: var(--color-bg-tertiary);
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: var(--space-10);
  }

  .empty-icon {
    margin-bottom: var(--space-4);
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .empty-state h3 {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-lg);
  }

  .empty-state p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    max-width: 480px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
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
    .page-header {
      flex-direction: column;
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .drop-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .config-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
  }
</style>
