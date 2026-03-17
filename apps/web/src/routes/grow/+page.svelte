<script lang="ts">
  import { onMount } from "svelte";
  import type { RecipeEngagementScore } from "@dough/shared";
  import {
    analytics,
    segmentation,
    automation,
    type SegmentProfileData,
    type SeasonalDrop,
  } from "$lib/api.js";

  let topRecipe = $state<RecipeEngagementScore | null>(null);
  let totalSubscribers = $state(0);
  let activeDropsCount = $state(0);
  let segmentCount = $state(0);
  let loading = $state(true);

  onMount(async () => {
    try {
      const [scores, profile, drops] = await Promise.all([
        analytics.getEngagementScores().catch(() => [] as RecipeEngagementScore[]),
        segmentation.getProfile().catch(() => null as SegmentProfileData | null),
        automation.getSeasonalDrops().catch(() => [] as SeasonalDrop[]),
      ]);

      // Top recipe by engagement
      if (scores.length > 0) {
        const sorted = [...scores].sort((a, b) => b.score - a.score);
        topRecipe = sorted[0] ?? null;
      }

      // Total subscribers from segments
      if (profile !== null) {
        const subscribers = Object.values(profile.segments);
        totalSubscribers = subscribers.reduce((sum, s) => sum + s.subscriber_count, 0);
        segmentCount = subscribers.filter((s) => s.subscriber_count > 0).length;
      }

      // Active seasonal drops
      const today = new Date().toISOString().split("T")[0] ?? "";
      activeDropsCount = drops.filter((d) => d.start_date <= today && d.end_date >= today).length;
    } catch {
      // Silently handle -- dashboard is best-effort
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Grow - dough</title>
</svelte:head>

<div class="grow-page">
  <h1>Grow Dashboard</h1>
  <p class="page-description">Understand your audience and grow your email list.</p>

  {#if loading}
    <div class="stats-grid loading-state">
      <div class="stat-card card">
        <div class="stat-shimmer"></div>
      </div>
      <div class="stat-card card">
        <div class="stat-shimmer"></div>
      </div>
      <div class="stat-card card">
        <div class="stat-shimmer"></div>
      </div>
    </div>
  {:else}
    <div class="stats-grid">
      <div class="stat-card card">
        <span class="stat-label">Total Subscribers</span>
        <span class="stat-value">{totalSubscribers.toLocaleString()}</span>
        <span class="stat-detail"
          >across {segmentCount} active segment{segmentCount !== 1 ? "s" : ""}</span
        >
      </div>
      <div class="stat-card card">
        <span class="stat-label">Top Recipe</span>
        {#if topRecipe}
          <span class="stat-value stat-recipe">{topRecipe.recipe_id}</span>
          <span class="stat-detail">score: {topRecipe.score.toFixed(1)} / 10</span>
        {:else}
          <span class="stat-value stat-empty">--</span>
          <span class="stat-detail">no engagement data yet</span>
        {/if}
      </div>
      <div class="stat-card card">
        <span class="stat-label">Active Seasonal Drops</span>
        <span class="stat-value">{activeDropsCount}</span>
        <span class="stat-detail">drop{activeDropsCount !== 1 ? "s" : ""} running now</span>
      </div>
    </div>
  {/if}

  <div class="dashboard-grid">
    <a href="/grow/analytics" class="dashboard-card card">
      <div class="card-icon">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 4 4-6" />
        </svg>
      </div>
      <h3>Analytics</h3>
      <p>Engagement scores, top recipes, product recommendations, and revenue attribution.</p>
    </a>

    <a href="/grow/segments" class="dashboard-card card">
      <div class="card-icon">
        <svg
          width="24"
          height="24"
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
      <h3>Segments</h3>
      <p>Dietary preference breakdown, subscriber distribution, and preference capture forms.</p>
    </a>

    <a href="/grow/automation" class="dashboard-card card">
      <div class="card-icon">
        <svg
          width="24"
          height="24"
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
      <h3>Automation</h3>
      <p>Seasonal drops, sequences, broadcast automation, and lead magnet delivery.</p>
    </a>
  </div>
</div>

<style>
  .grow-page {
    max-width: var(--max-content-width);
  }

  .grow-page h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .page-description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-8);
  }

  /* Stats cards */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-5);
  }

  .stat-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }

  .stat-recipe {
    font-size: var(--font-size-lg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-primary);
  }

  .stat-empty {
    color: var(--color-text-muted);
  }

  .stat-detail {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .stat-shimmer {
    height: 64px;
    background: linear-gradient(
      90deg,
      var(--color-bg-secondary) 25%,
      var(--color-bg-tertiary) 50%,
      var(--color-bg-secondary) 75%
    );
    background-size: 200% 100%;
    border-radius: var(--radius-md);
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  /* Dashboard navigation cards */
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .dashboard-card {
    text-decoration: none;
    color: var(--color-text);
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .dashboard-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
    color: var(--color-text);
  }

  .card-icon {
    color: var(--color-primary);
    opacity: 0.8;
  }

  .dashboard-card h3 {
    font-size: var(--font-size-lg);
  }

  .dashboard-card p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
