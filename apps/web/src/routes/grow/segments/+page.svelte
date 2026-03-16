<script lang="ts">
	import { onMount } from 'svelte';
	import { segmentation } from '$lib/api.js';

	let profile = $state<unknown | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			profile = await segmentation.getProfile();
		} catch (e) {
			error = 'Failed to load segment profile.';
			console.error(e);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Segments - crumb</title>
</svelte:head>

<div class="segments-page">
	<h1>Dietary Segments</h1>
	<p class="page-description">
		Understand the dietary preference distribution of your subscriber list.
	</p>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	{#if loading}
		<p class="loading">Loading segment profile...</p>
	{:else if profile === null}
		<div class="empty-state card">
			<h3>No segment data yet</h3>
			<p>
				Connect your Kit account and confirm dietary tags on your recipes
				to see subscriber dietary preference breakdown.
			</p>
			<a href="/settings/kit" class="btn btn-primary">Connect Kit</a>
		</div>
	{:else}
		<div class="card">
			<h3>Segment Profile</h3>
			<p class="coming-soon">
				Detailed segment visualization is under development.
				Your segment data has been computed successfully.
			</p>
		</div>
	{/if}
</div>

<style>
	.segments-page {
		max-width: var(--max-content-width);
	}

	.segments-page h1 {
		font-size: var(--font-size-2xl);
		margin-bottom: var(--space-2);
	}

	.page-description {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-8);
	}

	.empty-state {
		text-align: center;
	}

	.empty-state h3 {
		margin-bottom: var(--space-2);
	}

	.empty-state p {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
	}

	.loading {
		text-align: center;
		padding: var(--space-16);
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
