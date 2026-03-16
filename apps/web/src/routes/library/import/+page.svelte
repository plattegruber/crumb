<script lang="ts">
	import { onMount } from 'svelte';
	import type { ImportJob } from '@crumb/shared';
	import { imports } from '$lib/api.js';

	let importUrl = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let jobList = $state<ImportJob[]>([]);
	let loadingJobs = $state(true);

	async function handleUrlImport(e: Event) {
		e.preventDefault();
		if (!importUrl.trim()) return;

		submitting = true;
		error = null;
		success = null;

		try {
			await imports.create('FromUrl', { url: importUrl.trim() });
			success = 'Import started! Check below for status.';
			importUrl = '';
			await fetchJobs();
		} catch (e) {
			error = 'Failed to start import. Please check the URL and try again.';
			console.error(e);
		} finally {
			submitting = false;
		}
	}

	async function fetchJobs() {
		loadingJobs = true;
		try {
			jobList = await imports.list(20, 0);
		} catch (e) {
			console.error('Failed to load import jobs:', e);
		} finally {
			loadingJobs = false;
		}
	}

	function getStatusLabel(job: ImportJob): string {
		return job.status.type;
	}

	function getStatusClass(job: ImportJob): string {
		switch (job.status.type) {
			case 'Completed':
				return 'status-success';
			case 'Failed':
				return 'status-error';
			case 'Processing':
				return 'status-processing';
			case 'NeedsReview':
				return 'status-review';
			default:
				return 'status-pending';
		}
	}

	function getSourceLabel(job: ImportJob): string {
		const source = job.status.source;
		switch (source.type) {
			case 'FromUrl':
				return source.url;
			case 'FromInstagramPost':
				return `Instagram: ${source.url}`;
			case 'FromTikTokVideo':
				return `TikTok: ${source.url}`;
			case 'FromYouTubeVideo':
				return `YouTube: ${source.url}`;
			case 'FromScreenshot':
				return 'Screenshot upload';
			case 'FromInstagramBulk':
				return `Instagram: @${source.account_handle}`;
			case 'FromWordPressSync':
				return `WordPress: ${source.site_url}`;
			default:
				return 'Unknown source';
		}
	}

	async function handleConfirm(jobId: string) {
		try {
			await imports.confirm(jobId);
			await fetchJobs();
		} catch (e) {
			error = 'Failed to confirm import.';
			console.error(e);
		}
	}

	async function handleReject(jobId: string) {
		try {
			await imports.reject(jobId);
			await fetchJobs();
		} catch (e) {
			error = 'Failed to reject import.';
			console.error(e);
		}
	}

	onMount(() => {
		void fetchJobs();
	});
</script>

<svelte:head>
	<title>Import Recipes - crumb</title>
</svelte:head>

<div class="import-page">
	<h1>Import Recipes</h1>
	<p class="page-description">Import recipes from URLs, social media, or WordPress sites.</p>

	<!-- URL import form -->
	<div class="import-section card">
		<h2>Import from URL</h2>
		<p>Paste a recipe URL and we'll extract the recipe details automatically.</p>

		{#if error}
			<div class="error-banner">{error}</div>
		{/if}

		{#if success}
			<div class="success-banner">{success}</div>
		{/if}

		<form class="import-form" onsubmit={handleUrlImport}>
			<div class="input-row">
				<input
					type="url"
					bind:value={importUrl}
					placeholder="https://example.com/recipe/..."
					required
				/>
				<button type="submit" class="btn btn-primary" disabled={submitting}>
					{submitting ? 'Importing...' : 'Import'}
				</button>
			</div>
		</form>
	</div>

	<!-- Import history -->
	<div class="import-section">
		<h2>Recent Imports</h2>

		{#if loadingJobs}
			<p class="loading">Loading import history...</p>
		{:else if jobList.length === 0}
			<p class="empty">No imports yet. Start by importing a recipe above.</p>
		{:else}
			<div class="job-list">
				{#each jobList as job (job.id)}
					<div class="job-row">
						<div class="job-info">
							<span class={['job-status', getStatusClass(job)]}>
								{getStatusLabel(job)}
							</span>
							<span class="job-source">{getSourceLabel(job)}</span>
						</div>
						<div class="job-actions">
							{#if job.status.type === 'NeedsReview'}
								<button class="btn btn-primary" onclick={() => handleConfirm(job.id)}>
									Confirm
								</button>
								<button class="btn" onclick={() => handleReject(job.id)}>
									Reject
								</button>
							{/if}
							{#if job.status.type === 'Completed'}
								<a href="/library/{job.status.recipe_id}" class="btn">
									View Recipe
								</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
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
		margin-bottom: var(--space-2);
	}

	.import-section p {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-4);
	}

	.import-form {
		margin-top: var(--space-4);
	}

	.input-row {
		display: flex;
		gap: var(--space-2);
	}

	.input-row input {
		flex: 1;
	}

	.job-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.job-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		gap: var(--space-4);
	}

	.job-info {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	.job-status {
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

	.status-processing {
		background: var(--color-primary-light);
		color: var(--color-primary);
	}

	.status-review {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}

	.status-pending {
		background: var(--color-bg-tertiary);
		color: var(--color-text-muted);
	}

	.job-source {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.job-actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.loading,
	.empty {
		text-align: center;
		padding: var(--space-8);
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

	.success-banner {
		padding: var(--space-3) var(--space-4);
		background: var(--color-success-light);
		color: var(--color-success);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-4);
		font-size: var(--font-size-sm);
	}

	@media (max-width: 768px) {
		.input-row {
			flex-direction: column;
		}

		.job-row {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
