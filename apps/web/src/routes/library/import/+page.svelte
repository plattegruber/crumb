<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import type { ImportJob, RecipeExtract } from "@dough/shared";
  import { imports } from "$lib/api.js";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Import mode: "url" or "text"
  let importMode = $state<"url" | "text">("url");

  // URL import form
  let importUrl = $state("");
  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  // Text import form
  let importText = $state("");

  // All import jobs — split into active and history via $derived
  let allJobs = $state<ImportJob[]>([]);
  let loadingJobs = $state(true);

  // Pagination
  let historyPage = $state(0);
  const PAGE_SIZE = 10;

  // Polling intervals
  let jobPollingInterval: ReturnType<typeof setInterval> | null = null;
  const activeJobIntervals = new SvelteMap<string, ReturnType<typeof setInterval>>();

  // Review state — which job is being reviewed inline
  let reviewJobId = $state<string | null>(null);
  let reviewTitle = $state("");
  let confirmingId = $state<string | null>(null);
  let rejectingId = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const activeJobs = $derived(
    allJobs.filter((j) => j.status.type === "Pending" || j.status.type === "Processing"),
  );

  const reviewJobs = $derived(allJobs.filter((j) => j.status.type === "NeedsReview"));

  const historyJobs = $derived(
    allJobs.filter((j) => j.status.type === "Completed" || j.status.type === "Failed"),
  );

  const paginatedHistory = $derived(
    historyJobs.slice(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE),
  );

  const totalHistoryPages = $derived(Math.ceil(historyJobs.length / PAGE_SIZE));

  const hasAnyJobs = $derived(allJobs.length > 0);

  // ---------------------------------------------------------------------------
  // Import submission
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting) return;

    submitting = true;
    submitError = null;

    try {
      let job: ImportJob;
      if (importMode === "url") {
        const url = importUrl.trim();
        if (!url) return;
        job = await imports.create("FromUrl", { url });
        importUrl = "";
      } else {
        const text = importText.trim();
        if (!text) return;
        job = await imports.createFromText(text);
        importText = "";
      }

      // Add the new job to the top of the list
      allJobs = [job, ...allJobs];

      // Start polling this specific job
      startJobPolling(job.id);
    } catch (err: unknown) {
      if (err instanceof Error) {
        submitError = err.message;
      } else {
        submitError = "Failed to start import. Please try again.";
      }
      console.error(err);
    } finally {
      submitting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  function startJobPolling(jobId: string) {
    // Don't duplicate intervals
    if (activeJobIntervals.has(jobId)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await imports.get(jobId);
        updateJobInList(updated);

        // Stop polling when job reaches a terminal or review state
        if (
          updated.status.type === "Completed" ||
          updated.status.type === "Failed" ||
          updated.status.type === "NeedsReview"
        ) {
          stopJobPolling(jobId);
        }
      } catch (err: unknown) {
        console.error(`Failed to poll job ${jobId}:`, err);
        // Stop polling on repeated errors to avoid hammering the server
        stopJobPolling(jobId);
      }
    }, 2000);

    activeJobIntervals.set(jobId, interval);
  }

  function stopJobPolling(jobId: string) {
    const interval = activeJobIntervals.get(jobId);
    if (interval !== undefined) {
      clearInterval(interval);
      activeJobIntervals.delete(jobId);
    }
  }

  function updateJobInList(updated: ImportJob) {
    allJobs = allJobs.map((j) => (j.id === updated.id ? updated : j));
  }

  async function fetchAllJobs() {
    loadingJobs = true;
    try {
      allJobs = await imports.list(100, 0);
    } catch (err: unknown) {
      console.error("Failed to load import jobs:", err);
    } finally {
      loadingJobs = false;
    }
  }

  function startBackgroundPolling() {
    // Poll all active jobs every 5 seconds
    jobPollingInterval = setInterval(async () => {
      if (activeJobs.length === 0 && reviewJobs.length === 0) return;

      try {
        const updated = await imports.list(100, 0);
        allJobs = updated;
      } catch (err: unknown) {
        console.error("Background poll failed:", err);
      }
    }, 5000);
  }

  // ---------------------------------------------------------------------------
  // Review actions
  // ---------------------------------------------------------------------------

  function openReview(job: ImportJob) {
    reviewJobId = job.id;
    if (job.status.type === "NeedsReview" && job.status.extract.title !== null) {
      reviewTitle = job.status.extract.title;
    } else {
      reviewTitle = "";
    }
  }

  function closeReview() {
    reviewJobId = null;
    reviewTitle = "";
  }

  async function handleConfirm(jobId: string) {
    confirmingId = jobId;
    try {
      const result = await imports.confirm(jobId);
      updateJobInList(result);
      closeReview();

      // Navigate to the new recipe if we got a recipe_id back
      if (result.status.type === "Completed") {
        await goto(`/library/${result.status.recipe_id}`);
      }
    } catch (err: unknown) {
      console.error("Failed to confirm import:", err);
      submitError = "Failed to confirm import. Please try again.";
    } finally {
      confirmingId = null;
    }
  }

  async function handleReject(jobId: string) {
    rejectingId = jobId;
    try {
      await imports.reject(jobId);
      // Re-fetch to get the updated status
      try {
        const updated = await imports.get(jobId);
        updateJobInList(updated);
      } catch {
        // If the get fails, just remove from review
        allJobs = allJobs.filter((j) => j.id !== jobId);
      }
      closeReview();
    } catch (err: unknown) {
      console.error("Failed to reject import:", err);
      submitError = "Failed to reject import. Please try again.";
    } finally {
      rejectingId = null;
    }
  }

  async function handleRetry(job: ImportJob) {
    submitting = true;
    submitError = null;
    try {
      const source = job.status.source;
      let newJob: ImportJob;
      if (
        source.type === "FromUrl" ||
        source.type === "FromInstagramPost" ||
        source.type === "FromTikTokVideo" ||
        source.type === "FromYouTubeVideo"
      ) {
        newJob = await imports.create(source.type, { url: source.url });
      } else if (source.type === "FromScreenshot") {
        newJob = await imports.create(source.type, { upload_id: source.upload_id });
      } else if (source.type === "FromInstagramBulk") {
        newJob = await imports.create(source.type, { account_handle: source.account_handle });
      } else if (source.type === "FromWordPressSync") {
        newJob = await imports.create(source.type, { site_url: source.site_url });
      } else {
        return;
      }
      allJobs = [newJob, ...allJobs];
      startJobPolling(newJob.id);
    } catch (err: unknown) {
      submitError = "Failed to retry import. Please try again.";
      console.error(err);
    } finally {
      submitting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getSourceLabel(job: ImportJob): string {
    const source = job.status.source;
    switch (source.type) {
      case "FromUrl":
        return source.url;
      case "FromInstagramPost":
        return `Instagram: ${source.url}`;
      case "FromTikTokVideo":
        return `TikTok: ${source.url}`;
      case "FromYouTubeVideo":
        return `YouTube: ${source.url}`;
      case "FromScreenshot":
        return "Screenshot upload";
      case "FromInstagramBulk":
        return `Instagram: @${source.account_handle}`;
      case "FromWordPressSync":
        return `WordPress: ${source.site_url}`;
      default:
        return "Unknown source";
    }
  }

  function formatElapsed(job: ImportJob): string {
    const startMs = job.created_at;
    const start = typeof startMs === "number" ? startMs : Date.parse(startMs as unknown as string);
    const elapsed = Date.now() - start;
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  function formatDate(timestamp: number): string {
    const ts =
      typeof timestamp === "number" ? timestamp : Date.parse(timestamp as unknown as string);
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function confidenceColor(score: number): string {
    if (score >= 0.8) return "var(--color-success)";
    if (score >= 0.5) return "var(--color-warning)";
    return "var(--color-danger)";
  }

  function confidenceLabel(score: number): string {
    if (score >= 0.8) return "High confidence";
    if (score >= 0.5) return "Medium confidence";
    return "Low confidence";
  }

  function countIngredients(extract: RecipeExtract): number {
    let count = 0;
    for (const group of extract.ingredients) {
      count += group.ingredients.length;
    }
    return count;
  }

  function truncateUrl(url: string, maxLen = 60): string {
    if (url.length <= maxLen) return url;
    return url.substring(0, maxLen) + "...";
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMount(async () => {
    await fetchAllJobs();

    // Start polling for any active jobs that are already in progress
    for (const job of allJobs) {
      if (job.status.type === "Pending" || job.status.type === "Processing") {
        startJobPolling(job.id);
      }
    }

    startBackgroundPolling();
  });

  onDestroy(() => {
    // Clean up all polling intervals
    if (jobPollingInterval !== null) {
      clearInterval(jobPollingInterval);
    }
    for (const interval of activeJobIntervals.values()) {
      clearInterval(interval);
    }
  });
</script>

<svelte:head>
  <title>Import Recipes - dough</title>
</svelte:head>

<div class="import-page">
  <h1>Import Recipes</h1>
  <p class="page-description">
    Import recipes from URLs, blog posts, or paste recipe text directly.
  </p>

  <!-- ===================================================================== -->
  <!-- Import Form -->
  <!-- ===================================================================== -->

  <div class="import-section card">
    <!-- Tab toggle -->
    <div class="import-tabs">
      <button
        class={["tab-btn", { active: importMode === "url" }]}
        onclick={() => (importMode = "url")}
      >
        Import from URL
      </button>
      <button
        class={["tab-btn", { active: importMode === "text" }]}
        onclick={() => (importMode = "text")}
      >
        Paste Recipe Text
      </button>
    </div>

    {#if submitError}
      <div class="error-banner">{submitError}</div>
    {/if}

    <form class="import-form" onsubmit={handleSubmit}>
      {#if importMode === "url"}
        <p class="form-hint">
          Paste a recipe URL and we'll extract the recipe details automatically.
        </p>
        <div class="input-row">
          <input
            type="url"
            bind:value={importUrl}
            placeholder="https://example.com/recipe/..."
            required
            disabled={submitting}
          />
          <button type="submit" class="btn btn-primary" disabled={submitting || !importUrl.trim()}>
            {submitting ? "Importing..." : "Import"}
          </button>
        </div>
      {:else}
        <p class="form-hint">Paste the full recipe text and we'll extract the structured data.</p>
        <textarea
          bind:value={importText}
          placeholder="Paste your recipe here...

Example:
Classic Banana Bread
Prep: 15 min | Cook: 60 min

Ingredients:
- 3 ripe bananas
- 1/3 cup melted butter
- 3/4 cup sugar
..."
          rows="8"
          disabled={submitting}
        ></textarea>
        <div class="text-submit-row">
          <button type="submit" class="btn btn-primary" disabled={submitting || !importText.trim()}>
            {submitting ? "Extracting..." : "Extract Recipe"}
          </button>
        </div>
      {/if}
    </form>
  </div>

  <!-- ===================================================================== -->
  <!-- Active Imports (Pending + Processing) -->
  <!-- ===================================================================== -->

  {#if activeJobs.length > 0}
    <div class="import-section">
      <h2>In Progress</h2>
      <div class="active-jobs">
        {#each activeJobs as job (job.id)}
          <div class="progress-card card">
            <div class="progress-header">
              <div class="progress-status">
                {#if job.status.type === "Pending"}
                  <span class="status-indicator pending-pulse"></span>
                  <span class="status-text">Queued...</span>
                {:else}
                  <span class="spinner"></span>
                  <span class="status-text">Extracting recipe...</span>
                {/if}
              </div>
              <span class="elapsed-time">{formatElapsed(job)}</span>
            </div>
            <p class="progress-source">{truncateUrl(getSourceLabel(job))}</p>
            <div class="progress-bar-track">
              <div
                class="progress-bar-fill"
                class:pending={job.status.type === "Pending"}
                class:processing={job.status.type === "Processing"}
              ></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ===================================================================== -->
  <!-- Needs Review -->
  <!-- ===================================================================== -->

  {#if reviewJobs.length > 0}
    <div class="import-section">
      <h2>Needs Review</h2>
      <div class="review-jobs">
        {#each reviewJobs as job (job.id)}
          {@const extract = job.status.type === "NeedsReview" ? job.status.extract : null}
          {#if extract}
            <div class="review-card card" class:expanded={reviewJobId === job.id}>
              <div class="review-header">
                <div class="review-info">
                  <span class="status-badge status-review">Needs Review</span>
                  <span class="review-title">{extract.title ?? "Untitled Recipe"}</span>
                </div>
                <div class="review-actions-header">
                  {#if reviewJobId !== job.id}
                    <button class="btn" onclick={() => openReview(job)}> Review </button>
                  {:else}
                    <button class="btn btn-ghost" onclick={closeReview}> Collapse </button>
                  {/if}
                </div>
              </div>

              {#if reviewJobId === job.id}
                <div class="review-body">
                  <!-- Confidence Bar -->
                  <div class="confidence-section">
                    <div class="confidence-header">
                      <span class="confidence-label"
                        >{confidenceLabel(extract.confidence.overall)}</span
                      >
                      <span
                        class="confidence-score"
                        style="color: {confidenceColor(extract.confidence.overall)}"
                      >
                        {Math.round(extract.confidence.overall * 100)}%
                      </span>
                    </div>
                    <div class="confidence-bar-track">
                      <div
                        class="confidence-bar-fill"
                        style="width: {extract.confidence.overall *
                          100}%; background: {confidenceColor(extract.confidence.overall)}"
                      ></div>
                    </div>
                    {#if extract.confidence.overall < 0.5}
                      <p class="confidence-warning">
                        Low confidence extraction. Please review carefully before confirming.
                      </p>
                    {/if}
                  </div>

                  <!-- Extracted Data Preview -->
                  <div class="extract-grid">
                    <div class="extract-field">
                      <label for="review-title">Title</label>
                      <input
                        id="review-title"
                        type="text"
                        bind:value={reviewTitle}
                        placeholder="Recipe title"
                      />
                    </div>

                    {#if extract.description}
                      <div class="extract-field full-width">
                        <span class="field-label">Description</span>
                        <p class="extract-value">{extract.description}</p>
                      </div>
                    {/if}

                    <div class="extract-field">
                      <span class="field-label">Ingredients</span>
                      <p class="extract-value">{countIngredients(extract)} ingredients</p>
                    </div>

                    <div class="extract-field">
                      <span class="field-label">Instructions</span>
                      <p class="extract-value">{extract.instructions.length} steps</p>
                    </div>

                    {#if extract.timing.prep_minutes !== null || extract.timing.cook_minutes !== null}
                      <div class="extract-field">
                        <span class="field-label">Timing</span>
                        <p class="extract-value">
                          {#if extract.timing.prep_minutes !== null}
                            Prep: {extract.timing.prep_minutes} min
                          {/if}
                          {#if extract.timing.prep_minutes !== null && extract.timing.cook_minutes !== null}
                            |
                          {/if}
                          {#if extract.timing.cook_minutes !== null}
                            Cook: {extract.timing.cook_minutes} min
                          {/if}
                        </p>
                      </div>
                    {/if}

                    {#if extract.yield !== null}
                      <div class="extract-field">
                        <span class="field-label">Yield</span>
                        <p class="extract-value">{extract.yield.quantity} {extract.yield.unit}</p>
                      </div>
                    {/if}

                    {#if extract.photo_urls.length > 0}
                      <div class="extract-field full-width">
                        <span class="field-label">Photos</span>
                        <div class="photo-previews">
                          {#each extract.photo_urls as photoUrl, i (i)}
                            <img src={photoUrl} alt="Extracted recipe" class="photo-thumb" />
                          {/each}
                        </div>
                      </div>
                    {/if}

                    <!-- Ingredients preview -->
                    <div class="extract-field full-width">
                      <span class="field-label">Ingredients Preview</span>
                      <div class="ingredients-preview">
                        {#each extract.ingredients as group, gi (gi)}
                          {#if group.label}
                            <strong class="group-label">{group.label}</strong>
                          {/if}
                          <ul>
                            {#each group.ingredients as ingredient, ii (ii)}
                              <li>{ingredient.raw_text}</li>
                            {/each}
                          </ul>
                        {/each}
                      </div>
                    </div>
                  </div>

                  <!-- Confirm / Reject -->
                  <div class="review-actions">
                    <button
                      class="btn btn-primary"
                      onclick={() => handleConfirm(job.id)}
                      disabled={confirmingId === job.id || rejectingId === job.id}
                    >
                      {confirmingId === job.id ? "Creating recipe..." : "Confirm & Create Recipe"}
                    </button>
                    <button
                      class="btn btn-danger"
                      onclick={() => handleReject(job.id)}
                      disabled={confirmingId === job.id || rejectingId === job.id}
                    >
                      {rejectingId === job.id ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                </div>
              {:else}
                <!-- Collapsed summary -->
                <div class="review-summary">
                  <span class="summary-detail">{countIngredients(extract)} ingredients</span>
                  <span class="summary-sep">|</span>
                  <span class="summary-detail">{extract.instructions.length} steps</span>
                  {#if extract.timing.total_minutes !== null}
                    <span class="summary-sep">|</span>
                    <span class="summary-detail">{extract.timing.total_minutes} min total</span>
                  {/if}
                  <span class="summary-sep">|</span>
                  <span
                    class="summary-detail"
                    style="color: {confidenceColor(extract.confidence.overall)}"
                  >
                    {Math.round(extract.confidence.overall * 100)}% confidence
                  </span>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- ===================================================================== -->
  <!-- Import History -->
  <!-- ===================================================================== -->

  <div class="import-section">
    <h2>Import History</h2>

    {#if loadingJobs}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading import history...</p>
      </div>
    {:else if !hasAnyJobs}
      <div class="empty-state card">
        <div class="empty-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h3>Import your first recipe</h3>
        <p>
          Paste a URL from any recipe blog or website above, and we'll automatically extract the
          recipe details.
        </p>
        <div class="supported-sources">
          <span class="source-tag">Recipe blogs</span>
          <span class="source-tag">News sites</span>
          <span class="source-tag">Social media links</span>
          <span class="source-tag">Plain text recipes</span>
        </div>
      </div>
    {:else if historyJobs.length === 0}
      <p class="no-history">No completed or failed imports yet.</p>
    {:else}
      <div class="history-list">
        {#each paginatedHistory as job (job.id)}
          <div class="history-row">
            <div class="history-info">
              <span
                class={[
                  "status-badge",
                  job.status.type === "Completed" ? "status-success" : "status-error",
                ]}
              >
                {job.status.type}
              </span>
              <span class="history-source" title={getSourceLabel(job)}>
                {truncateUrl(getSourceLabel(job), 50)}
              </span>
              <span class="history-date">{formatDate(job.updated_at)}</span>
            </div>
            <div class="history-actions">
              {#if job.status.type === "Completed"}
                <a href="/library/{job.status.recipe_id}" class="btn btn-ghost"> View Recipe </a>
              {/if}
              {#if job.status.type === "Failed"}
                <span
                  class="error-reason"
                  title={job.status.error.type === "FetchFailed" ||
                  job.status.error.type === "ExtractionFailed"
                    ? job.status.error.reason
                    : job.status.error.type}
                >
                  {#if job.status.error.type === "FetchFailed" || job.status.error.type === "ExtractionFailed"}
                    {truncateUrl(job.status.error.reason, 40)}
                  {:else}
                    {job.status.error.type}
                  {/if}
                </span>
                <button
                  class="btn btn-ghost"
                  onclick={() => handleRetry(job)}
                  disabled={submitting}
                >
                  Try Again
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination -->
      {#if totalHistoryPages > 1}
        <div class="pagination">
          <button
            class="btn btn-ghost"
            disabled={historyPage === 0}
            onclick={() => (historyPage = historyPage - 1)}
          >
            Previous
          </button>
          <span class="page-info">Page {historyPage + 1} of {totalHistoryPages}</span>
          <button
            class="btn btn-ghost"
            disabled={historyPage >= totalHistoryPages - 1}
            onclick={() => (historyPage = historyPage + 1)}
          >
            Next
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .import-page {
    max-width: 780px;
  }

  .import-page h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .page-description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-8);
  }

  .import-section {
    margin-bottom: var(--space-8);
  }

  .import-section h2 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
  }

  /* ===================================================================== */
  /* Tab toggle                                                            */
  /* ===================================================================== */

  .import-tabs {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    padding: 3px;
  }

  .tab-btn {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab-btn.active {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
  }

  .tab-btn:hover:not(.active) {
    color: var(--color-text);
  }

  /* ===================================================================== */
  /* Import form                                                           */
  /* ===================================================================== */

  .form-hint {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-3);
  }

  .import-form {
    margin-top: 0;
  }

  .input-row {
    display: flex;
    gap: var(--space-2);
  }

  .input-row input {
    flex: 1;
  }

  .import-form textarea {
    width: 100%;
    resize: vertical;
    min-height: 160px;
    font-family: var(--font-sans);
  }

  .text-submit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-3);
  }

  /* ===================================================================== */
  /* Error / Success banners                                               */
  /* ===================================================================== */

  .error-banner {
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light);
    color: var(--color-danger);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  /* ===================================================================== */
  /* Status badges                                                         */
  /* ===================================================================== */

  .status-badge {
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  .status-success {
    background: var(--color-success-light);
    color: var(--color-success);
  }

  .status-error {
    background: var(--color-danger-light);
    color: var(--color-danger);
  }

  .status-review {
    background: #eef2ff;
    color: #4338ca;
  }

  /* ===================================================================== */
  /* Active imports — progress cards                                       */
  /* ===================================================================== */

  .active-jobs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .progress-card {
    padding: var(--space-4);
  }

  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .progress-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }

  .pending-pulse {
    animation: pulse 2s ease-in-out infinite;
    background: var(--color-warning);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .status-text {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .elapsed-time {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .progress-source {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-bar-track {
    height: 4px;
    background: var(--color-bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-bar-fill.pending {
    width: 15%;
    background: var(--color-warning);
    animation: pendingSlide 2s ease-in-out infinite;
  }

  .progress-bar-fill.processing {
    width: 60%;
    background: var(--color-primary);
    animation: processingPulse 1.5s ease-in-out infinite;
  }

  @keyframes pendingSlide {
    0%,
    100% {
      width: 10%;
      opacity: 0.6;
    }
    50% {
      width: 25%;
      opacity: 1;
    }
  }

  @keyframes processingPulse {
    0%,
    100% {
      width: 40%;
    }
    50% {
      width: 70%;
    }
  }

  /* ===================================================================== */
  /* Review cards                                                          */
  /* ===================================================================== */

  .review-jobs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .review-card {
    padding: var(--space-4);
    border-left: 3px solid #4338ca;
    transition: all var(--transition-base);
  }

  .review-card.expanded {
    padding: var(--space-5);
  }

  .review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .review-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .review-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-actions-header {
    flex-shrink: 0;
  }

  .review-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-light);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .summary-sep {
    color: var(--color-border);
  }

  .review-body {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-light);
  }

  /* Confidence */

  .confidence-section {
    margin-bottom: var(--space-5);
  }

  .confidence-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .confidence-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .confidence-score {
    font-size: var(--font-size-sm);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .confidence-bar-track {
    height: 6px;
    background: var(--color-bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
  }

  .confidence-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease;
  }

  .confidence-warning {
    margin-top: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-danger);
    font-weight: 500;
  }

  /* Extract grid */

  .extract-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .extract-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .extract-field.full-width {
    grid-column: 1 / -1;
  }

  .field-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 0;
  }

  .extract-value {
    font-size: var(--font-size-sm);
    color: var(--color-text);
  }

  .photo-previews {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .photo-thumb {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-light);
  }

  .ingredients-preview {
    font-size: var(--font-size-sm);
    max-height: 200px;
    overflow-y: auto;
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .ingredients-preview ul {
    list-style: none;
    padding: 0;
  }

  .ingredients-preview li {
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .ingredients-preview li:last-child {
    border-bottom: none;
  }

  .group-label {
    display: block;
    margin-top: var(--space-2);
    margin-bottom: var(--space-1);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .group-label:first-child {
    margin-top: 0;
  }

  /* Review actions */

  .review-actions {
    display: flex;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-light);
  }

  /* ===================================================================== */
  /* History list                                                          */
  /* ===================================================================== */

  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .history-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    gap: var(--space-3);
  }

  .history-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    flex: 1;
  }

  .history-source {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .history-date {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .history-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .error-reason {
    font-size: var(--font-size-xs);
    color: var(--color-danger);
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ===================================================================== */
  /* Pagination                                                            */
  /* ===================================================================== */

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }

  .page-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* ===================================================================== */
  /* Empty / Loading states                                                */
  /* ===================================================================== */

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-10);
    color: var(--color-text-secondary);
  }

  .loading-state .spinner {
    width: 24px;
    height: 24px;
  }

  .empty-state {
    text-align: center;
    padding: var(--space-10) var(--space-6);
  }

  .empty-icon {
    color: var(--color-text-muted);
    margin-bottom: var(--space-4);
  }

  .empty-state h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  .empty-state p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    max-width: 400px;
    margin: 0 auto var(--space-4);
    line-height: 1.6;
  }

  .supported-sources {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }

  .source-tag {
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-3);
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-radius: var(--radius-xl);
    font-weight: 500;
  }

  .no-history {
    text-align: center;
    padding: var(--space-6);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  /* ===================================================================== */
  /* Responsive                                                            */
  /* ===================================================================== */

  @media (max-width: 768px) {
    .input-row {
      flex-direction: column;
    }

    .history-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .history-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .review-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .review-summary {
      flex-wrap: wrap;
    }

    .extract-grid {
      grid-template-columns: 1fr;
    }

    .review-actions {
      flex-direction: column;
    }

    .review-actions .btn {
      width: 100%;
    }
  }
</style>
