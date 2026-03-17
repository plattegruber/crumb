<script lang="ts">
  import { onMount } from "svelte";
  import { segmentation, type SegmentProfileData, type SegmentData } from "$lib/api.js";

  let profile = $state<SegmentProfileData | null>(null);
  let loading = $state(true);
  let computing = $state(false);
  let error = $state<string | null>(null);
  let expandedSegment = $state<string | null>(null);

  onMount(async () => {
    try {
      profile = await segmentation.getProfile();
    } catch (e) {
      error = "Failed to load segment profile.";
      console.error(e);
    } finally {
      loading = false;
    }
  });

  const segments = $derived<[string, SegmentData][]>(() => {
    if (profile === null) return [];
    return Object.entries(profile.segments).sort(
      (a, b) => b[1].subscriber_count - a[1].subscriber_count,
    );
  });

  const totalSubscribers = $derived(() => {
    if (profile === null) return 0;
    return Math.max(...Object.values(profile.segments).map((s) => s.subscriber_count), 1);
  });

  async function handleCompute() {
    computing = true;
    error = null;
    try {
      profile = await segmentation.computeProfile();
    } catch (e) {
      error = "Failed to compute segment profile. Make sure your Kit account is connected.";
      console.error(e);
    } finally {
      computing = false;
    }
  }

  function toggleSegment(tag: string) {
    expandedSegment = expandedSegment === tag ? null : tag;
  }

  function dietaryTagLabel(tag: string): string {
    const labels: Record<string, string> = {
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
    return labels[tag] ?? tag;
  }

  function tagColorVar(tag: string): string {
    const map: Record<string, string> = {
      GlutenFree: "var(--color-tag-gluten-free)",
      DairyFree: "var(--color-tag-dairy-free)",
      Vegan: "var(--color-tag-vegan)",
      Vegetarian: "var(--color-tag-vegetarian)",
      Keto: "var(--color-tag-keto)",
      Paleo: "var(--color-tag-paleo)",
      NutFree: "var(--color-tag-nut-free)",
      EggFree: "var(--color-tag-egg-free)",
      SoyFree: "var(--color-tag-soy-free)",
    };
    return map[tag] ?? "var(--color-primary)";
  }

  function formatRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
  }

  function formatGrowth(rate: number): string {
    if (rate > 0) return `+${(rate * 100).toFixed(1)}%`;
    if (rate < 0) return `${(rate * 100).toFixed(1)}%`;
    return "0%";
  }

  function barWidth(count: number, max: number): string {
    if (max <= 0) return "0%";
    return `${Math.max(2, (count / max) * 100)}%`;
  }
</script>

<svelte:head>
  <title>Segments - dough</title>
</svelte:head>

<div class="segments-page">
  <div class="page-header">
    <div>
      <h1>Dietary Segments</h1>
      <p class="page-description">
        Understand the dietary preference distribution of your subscriber list.
      </p>
    </div>
    <div class="header-actions">
      <button class="btn" onclick={handleCompute} disabled={computing}>
        {computing ? "Computing..." : "Compute Segments"}
      </button>
      <a href="/grow" class="btn btn-ghost">Back to Grow</a>
    </div>
  </div>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <p class="loading">Loading segment profile...</p>
  {:else if profile === null}
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
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a7 7 0 0 0 0 14" />
          <path d="M12 2a7 7 0 0 1 0 14" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      </div>
      <h3>No segment data yet</h3>
      <p>
        Connect your Kit account and confirm dietary tags on your recipes to see subscriber dietary
        preference breakdown. Click "Compute Segments" to generate your first profile.
      </p>
      <div class="empty-actions">
        <button class="btn btn-primary" onclick={handleCompute} disabled={computing}>
          {computing ? "Computing..." : "Compute Segments"}
        </button>
        <a href="/settings/kit" class="btn">Connect Kit</a>
      </div>
    </div>
  {:else}
    <div class="profile-meta">
      <span class="meta-label">Last computed:</span>
      <span class="meta-value"
        >{new Date(profile.computed_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}</span
      >
    </div>

    <div class="segment-grid">
      {#each segments() as [tag, data] (tag)}
        <button
          class="segment-card card"
          class:expanded={expandedSegment === tag}
          onclick={() => toggleSegment(tag)}
          type="button"
        >
          <div class="segment-header">
            <span class="segment-tag" style="color: {tagColorVar(tag)};">
              {dietaryTagLabel(tag)}
            </span>
            <span class="segment-count">{data.subscriber_count}</span>
          </div>

          <div class="segment-bar-container">
            <div
              class="segment-bar"
              style="width: {barWidth(
                data.subscriber_count,
                totalSubscribers(),
              )}; background: {tagColorVar(tag)};"
            ></div>
          </div>

          <div class="segment-stats">
            <div class="segment-stat">
              <span class="stat-value">{formatRate(data.engagement_rate)}</span>
              <span class="stat-label">engagement</span>
            </div>
            <div class="segment-stat">
              <span
                class="stat-value"
                class:positive={data.growth_rate_30d > 0}
                class:negative={data.growth_rate_30d < 0}
              >
                {formatGrowth(data.growth_rate_30d)}
              </span>
              <span class="stat-label">30d growth</span>
            </div>
          </div>

          {#if expandedSegment === tag}
            <div class="segment-detail">
              <h4>Top Recipes</h4>
              {#if data.top_recipe_ids.length === 0}
                <p class="detail-empty">No top recipes identified yet for this segment.</p>
              {:else}
                <ul class="top-recipes">
                  {#each data.top_recipe_ids.slice(0, 3) as recipeId (recipeId)}
                    <li>
                      <a href="/library/{recipeId}">{recipeId}</a>
                    </li>
                  {/each}
                </ul>
              {/if}

              <h4>Engagement Breakdown</h4>
              <div class="engagement-breakdown">
                <div class="breakdown-row">
                  <span class="breakdown-label">Subscribers</span>
                  <span class="breakdown-value">{data.subscriber_count}</span>
                </div>
                <div class="breakdown-row">
                  <span class="breakdown-label">Engagement Rate</span>
                  <span class="breakdown-value">{formatRate(data.engagement_rate)}</span>
                </div>
                <div class="breakdown-row">
                  <span class="breakdown-label">30-Day Growth</span>
                  <span class="breakdown-value">{formatGrowth(data.growth_rate_30d)}</span>
                </div>
              </div>
            </div>
          {/if}

          <span class="expand-hint">
            {expandedSegment === tag ? "Click to collapse" : "Click for details"}
          </span>
        </button>
      {/each}
    </div>

    <div class="actions-section">
      <h3>Actions</h3>
      <div class="action-cards">
        <div class="action-card card">
          <h4>Recompute Segments</h4>
          <p>Re-analyze your Kit subscriber tags and update segment data.</p>
          <button class="btn btn-primary" onclick={handleCompute} disabled={computing}>
            {computing ? "Computing..." : "Compute Segments"}
          </button>
        </div>
        <div class="action-card card">
          <h4>Preference Capture Form</h4>
          <p>Create a Kit form that lets subscribers self-identify their dietary preferences.</p>
          <a href="/settings/kit" class="btn btn-primary">Set Up Form</a>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .segments-page {
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

  .header-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .profile-meta {
    margin-bottom: var(--space-6);
    font-size: var(--font-size-sm);
  }

  .meta-label {
    color: var(--color-text-muted);
  }

  .meta-value {
    color: var(--color-text-secondary);
    margin-left: var(--space-1);
  }

  /* Segment grid */
  .segment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-10);
  }

  .segment-card {
    text-align: left;
    cursor: pointer;
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    border: 1px solid var(--color-border-light);
    background: var(--color-surface);
    font-family: var(--font-sans);
    width: 100%;
  }

  .segment-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .segment-card.expanded {
    box-shadow: var(--shadow-md);
  }

  .segment-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .segment-tag {
    font-weight: 600;
    font-size: var(--font-size-lg);
  }

  .segment-count {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }

  .segment-bar-container {
    height: 8px;
    background: var(--color-bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: var(--space-3);
  }

  .segment-bar {
    height: 100%;
    border-radius: 4px;
    transition: width var(--transition-base);
  }

  .segment-stats {
    display: flex;
    gap: var(--space-6);
    margin-bottom: var(--space-2);
  }

  .segment-stat {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-weight: 600;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }

  .stat-value.positive {
    color: var(--color-success);
  }

  .stat-value.negative {
    color: var(--color-danger);
  }

  .stat-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .expand-hint {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-2);
  }

  /* Segment detail (expanded) */
  .segment-detail {
    border-top: 1px solid var(--color-border-light);
    padding-top: var(--space-4);
    margin-top: var(--space-3);
  }

  .segment-detail h4 {
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: var(--space-2);
    color: var(--color-text);
  }

  .segment-detail h4:not(:first-child) {
    margin-top: var(--space-4);
  }

  .detail-empty {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .top-recipes {
    list-style: none;
    padding: 0;
  }

  .top-recipes li {
    padding: var(--space-1) 0;
    font-size: var(--font-size-sm);
  }

  .engagement-breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .breakdown-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-sm);
  }

  .breakdown-label {
    color: var(--color-text-secondary);
  }

  .breakdown-value {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Actions section */
  .actions-section {
    margin-top: var(--space-8);
  }

  .actions-section h3 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-4);
  }

  .action-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .action-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .action-card h4 {
    font-size: var(--font-size-base);
    font-weight: 600;
  }

  .action-card p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    flex: 1;
  }

  .action-card .btn {
    align-self: flex-start;
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
    margin-bottom: var(--space-6);
    line-height: 1.6;
  }

  .empty-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
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

    .header-actions {
      width: 100%;
    }

    .segment-grid {
      grid-template-columns: 1fr;
    }

    .action-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
