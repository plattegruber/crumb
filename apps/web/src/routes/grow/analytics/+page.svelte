<script lang="ts">
	import { onMount } from 'svelte';
	import type { RecipeEngagementScore } from '@crumb/shared';
	import { analytics } from '$lib/api.js';

	let scores = $state<RecipeEngagementScore[]>([]);
	let recommendations = $state<unknown[]>([]);
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
			error = 'Failed to load analytics data.';
			console.error(e);
		} finally {
			loading = false;
		}
	});

	let sortedScores = $derived(
		[...scores].sort((a, b) => b.score - a.score),
	);
</script>

<svelte:head>
	<title>Analytics - crumb</title>
</svelte:head>

<div class="analytics-page">
	<h1>Analytics</h1>
	<p class="page-description">Engagement scores and product recommendations for your recipes.</p>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	{#if loading}
		<p class="loading">Loading analytics...</p>
	{:else}
		<section class="analytics-section">
			<h2>Engagement Scores</h2>
			{#if sortedScores.length === 0}
				<div class="empty-state card">
					<p>No engagement data yet. Scores are computed from recipe card interactions, save clicks, and purchase attributions.</p>
				</div>
			{:else}
				<div class="score-list">
					{#each sortedScores as score (score.recipe_id)}
						<div class="score-row">
							<div class="score-info">
								<a href="/library/{score.recipe_id}" class="score-recipe">
									{score.recipe_id}
								</a>
								<div class="score-inputs">
									<span>{score.inputs.card_views_30d} views</span>
									<span>{score.inputs.save_clicks_30d} saves</span>
									<span>{score.inputs.sequence_triggers_30d} sequences</span>
								</div>
							</div>
							<div class="score-value">
								<span class="score-number">{score.score.toFixed(1)}</span>
								<span class="score-max">/ 10</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<section class="analytics-section">
			<h2>Recommendations</h2>
			{#if recommendations.length === 0}
				<div class="empty-state card">
					<p>No recommendations yet. Build up your recipe library and engagement data to receive product suggestions.</p>
				</div>
			{:else}
				<div class="card">
					<p class="coming-soon">Recommendation details are under development.</p>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.analytics-page {
		max-width: var(--max-content-width);
	}

	.analytics-page h1 {
		font-size: var(--font-size-2xl);
		margin-bottom: var(--space-2);
	}

	.page-description {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-8);
	}

	.analytics-section {
		margin-bottom: var(--space-8);
	}

	.analytics-section h2 {
		font-size: var(--font-size-xl);
		margin-bottom: var(--space-4);
	}

	.score-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.score-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
	}

	.score-recipe {
		font-weight: 600;
		font-size: var(--font-size-sm);
		display: block;
		margin-bottom: var(--space-1);
	}

	.score-inputs {
		display: flex;
		gap: var(--space-3);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.score-value {
		text-align: right;
		flex-shrink: 0;
	}

	.score-number {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-primary);
	}

	.score-max {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.loading {
		text-align: center;
		padding: var(--space-16);
		color: var(--color-text-secondary);
	}

	.empty-state p {
		color: var(--color-text-secondary);
	}

	.coming-soon {
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
</style>
