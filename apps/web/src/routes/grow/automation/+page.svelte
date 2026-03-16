<script lang="ts">
	import { onMount } from 'svelte';
	import { automation } from '$lib/api.js';

	let drops = $state<unknown[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			drops = await automation.getSeasonalDrops();
		} catch (e) {
			error = 'Failed to load automation data.';
			console.error(e);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Automation - crumb</title>
</svelte:head>

<div class="automation-page">
	<h1>Automation</h1>
	<p class="page-description">
		Configure automated seasonal drops, broadcast drafts, and lead magnet sequences.
	</p>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	{#if loading}
		<p class="loading">Loading automation config...</p>
	{:else}
		<section class="auto-section">
			<h2>Seasonal Drops</h2>
			{#if drops.length === 0}
				<div class="empty-state card">
					<h3>No seasonal drops configured</h3>
					<p>
						Create seasonal drops to automatically curate and send
						season-appropriate recipes to your subscribers.
					</p>
				</div>
			{:else}
				<div class="card">
					<p>{drops.length} seasonal drop{drops.length === 1 ? '' : 's'} configured.</p>
					<p class="coming-soon">Detailed seasonal drop management is under development.</p>
				</div>
			{/if}
		</section>

		<section class="auto-section">
			<h2>Broadcast Automation</h2>
			<div class="card">
				<p class="coming-soon">
					Automatically create Kit broadcast drafts when you publish a new recipe.
					Configuration coming soon.
				</p>
			</div>
		</section>

		<section class="auto-section">
			<h2>Lead Magnet Sequences</h2>
			<div class="card">
				<p class="coming-soon">
					Automatically create Kit sequences for lead magnet delivery.
					Configuration coming soon.
				</p>
			</div>
		</section>
	{/if}
</div>

<style>
	.automation-page {
		max-width: var(--max-content-width);
	}

	.automation-page h1 {
		font-size: var(--font-size-2xl);
		margin-bottom: var(--space-2);
	}

	.page-description {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-8);
	}

	.auto-section {
		margin-bottom: var(--space-8);
	}

	.auto-section h2 {
		font-size: var(--font-size-xl);
		margin-bottom: var(--space-4);
	}

	.empty-state h3 {
		margin-bottom: var(--space-2);
	}

	.empty-state p, .coming-soon {
		color: var(--color-text-secondary);
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
</style>
