<script lang="ts">
  import { onMount } from "svelte";
  import type { RecipeEngagementScore } from "@dough/shared";
  import { analytics, type ProductRecommendation } from "$lib/api.js";

  let scores = $state<RecipeEngagementScore[]>([]);
  let recommendations = $state<ProductRecommendation[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const [scoreData, recoData] = await Promise.all([
        analytics.getEngagementScores(),
        analytics.getRecommendations(),
      ]);
      scores = scoreData;
      recommendations = recoData;
    } catch (e) {
      error = "Failed to load analytics data.";
      console.error(e);
    } finally {
      loading = false;
    }
  });

  const sortedScores = $derived([...scores].sort((a, b) => b.score - a.score));

  function scoreColor(score: number): string {
    if (score >= 8) return "var(--color-success)";
    if (score >= 5) return "var(--color-warning)";
    if (score >= 3) return "var(--color-primary)";
    return "var(--color-text-muted)";
  }

  function scoreBarWidth(score: number): string {
    return `${Math.max(2, (score / 10) * 100)}%`;
  }

  function formatRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
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
</script>

<svelte:head>
  <title>Analytics - dough</title>
</svelte:head>

<div class="analytics-page">
  <div class="page-header">
    <div>
      <h1>Analytics</h1>
      <p class="page-description">
        Engagement scores, product recommendations, and revenue attribution.
      </p>
    </div>
    <a href="/grow" class="btn btn-ghost">Back to Grow</a>
  </div>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <p class="loading">Loading analytics...</p>
  {:else}
    <!-- Engagement Scores Section -->
    <section class="analytics-section">
      <h2>Engagement Scores</h2>
      {#if sortedScores.length === 0}
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
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-6" />
            </svg>
          </div>
          <h3>No engagement data yet</h3>
          <p>
            Scores are computed from recipe card interactions, save clicks, sequence triggers, and
            purchase attributions over the last 30 days. As subscribers interact with your recipes,
            scores will appear here ranked from highest to lowest.
          </p>
        </div>
      {:else}
        <div class="score-table card">
          <div class="score-table-header">
            <span class="col-recipe">Recipe</span>
            <span class="col-metric">Saves</span>
            <span class="col-metric">Views</span>
            <span class="col-metric">Sequences</span>
            <span class="col-metric">Purchases</span>
            <span class="col-score">Score</span>
          </div>
          {#each sortedScores as score (score.recipe_id)}
            <div class="score-table-row">
              <div class="col-recipe">
                <a href="/library/{score.recipe_id}" class="recipe-link">
                  {score.recipe_id}
                </a>
              </div>
              <span class="col-metric">{score.inputs.save_clicks_30d}</span>
              <span class="col-metric">{score.inputs.card_views_30d}</span>
              <span class="col-metric">{score.inputs.sequence_triggers_30d}</span>
              <span class="col-metric">{score.inputs.purchase_attributions_all}</span>
              <div class="col-score">
                <div class="score-bar-container">
                  <div
                    class="score-bar"
                    style="width: {scoreBarWidth(score.score)}; background: {scoreColor(
                      score.score,
                    )};"
                  ></div>
                </div>
                <span class="score-number" style="color: {scoreColor(score.score)};">
                  {score.score.toFixed(1)}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Recommendations Section -->
    <section class="analytics-section">
      <h2>Product Recommendations</h2>
      {#if recommendations.length === 0}
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
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3>No recommendations yet</h3>
          <p>
            The recommendation engine looks for dietary segments with 50+ subscribers, 15%+
            engagement, and 5+ confirmed recipes. Build up your recipe library, confirm dietary
            tags, and grow your subscriber list to receive ebook product suggestions.
          </p>
        </div>
      {:else}
        <div class="reco-grid">
          {#each recommendations as reco (reco.dietaryTag)}
            <div class="reco-card card">
              <div class="reco-header">
                <span class="reco-tag">{dietaryTagLabel(reco.dietaryTag)}</span>
                <span class="reco-score">{reco.avgScore.toFixed(1)} avg</span>
              </div>
              <p class="reco-message">{reco.message}</p>
              <div class="reco-stats">
                <div class="reco-stat">
                  <span class="reco-stat-value">{reco.subscriberCount}</span>
                  <span class="reco-stat-label">subscribers</span>
                </div>
                <div class="reco-stat">
                  <span class="reco-stat-value">{formatRate(reco.engagementRate)}</span>
                  <span class="reco-stat-label">engagement</span>
                </div>
                <div class="reco-stat">
                  <span class="reco-stat-value">{reco.recipeCount}</span>
                  <span class="reco-stat-label">recipes</span>
                </div>
              </div>
              <a href="/products/new/ebook" class="btn btn-primary reco-cta"> Create Ebook </a>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Revenue Attribution Section -->
    <section class="analytics-section">
      <h2>Revenue Attribution</h2>
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
            <path d="M12 6v12" />
            <path
              d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2.5 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5"
            />
          </svg>
        </div>
        <h3>Revenue attribution tracks product sales back to recipes</h3>
        <p>
          When a subscriber saves a recipe and later purchases a product containing that recipe, the
          system attributes the sale using a 30-day last-touch model. As purchases come in through
          Kit webhooks, attribution data will appear here showing which recipes drive the most
          revenue.
        </p>
      </div>
    </section>
  {/if}
</div>

<style>
  .analytics-page {
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

  .analytics-section {
    margin-bottom: var(--space-10);
  }

  .analytics-section h2 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-4);
  }

  /* Score table */
  .score-table {
    overflow-x: auto;
    padding: 0;
  }

  .score-table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 2fr;
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-light);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .score-table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 2fr;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border-light);
    transition: background var(--transition-fast);
  }

  .score-table-row:last-child {
    border-bottom: none;
  }

  .score-table-row:hover {
    background: var(--color-bg-secondary);
  }

  .col-recipe {
    min-width: 0;
  }

  .recipe-link {
    font-weight: 500;
    font-size: var(--font-size-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .col-metric {
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .col-score {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .score-bar-container {
    flex: 1;
    height: 6px;
    background: var(--color-bg-tertiary);
    border-radius: 3px;
    overflow: hidden;
  }

  .score-bar {
    height: 100%;
    border-radius: 3px;
    transition: width var(--transition-base);
  }

  .score-number {
    font-size: var(--font-size-sm);
    font-weight: 700;
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Recommendations */
  .reco-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-4);
  }

  .reco-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .reco-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .reco-tag {
    font-weight: 600;
    font-size: var(--font-size-lg);
    color: var(--color-primary);
  }

  .reco-score {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .reco-message {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .reco-stats {
    display: flex;
    gap: var(--space-6);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--color-border-light);
    border-bottom: 1px solid var(--color-border-light);
  }

  .reco-stat {
    display: flex;
    flex-direction: column;
  }

  .reco-stat-value {
    font-weight: 700;
    font-size: var(--font-size-lg);
    font-variant-numeric: tabular-nums;
  }

  .reco-stat-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .reco-cta {
    align-self: flex-start;
    margin-top: var(--space-1);
  }

  /* Empty states */
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

    .score-table-header,
    .score-table-row {
      grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1.5fr;
      font-size: var(--font-size-xs);
    }

    .reco-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
