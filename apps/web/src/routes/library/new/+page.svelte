<script lang="ts">
	import { goto } from '$app/navigation';
	import { recipes } from '$lib/api.js';

	let title = $state('');
	let description = $state('');
	let prepMinutes = $state('');
	let cookMinutes = $state('');
	let yieldQuantity = $state('');
	let yieldUnit = $state('servings');
	let notes = $state('');

	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!title.trim()) {
			error = 'Title is required.';
			return;
		}

		submitting = true;
		error = null;

		try {
			const input: Record<string, unknown> = {
				title: title.trim(),
				description: description.trim() || null,
				timing: {
					prep_minutes: prepMinutes ? parseInt(prepMinutes, 10) : null,
					cook_minutes: cookMinutes ? parseInt(cookMinutes, 10) : null,
					total_minutes: null,
				},
				notes: notes.trim() || null,
			};

			if (yieldQuantity) {
				input.yield = {
					quantity: parseInt(yieldQuantity, 10),
					unit: yieldUnit,
				};
			}

			const recipe = await recipes.create(input);
			await goto(`/library/${recipe.id}`);
		} catch (e) {
			error = 'Failed to create recipe. Please try again.';
			console.error(e);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>New Recipe - crumb</title>
</svelte:head>

<div class="new-recipe-page">
	<div class="page-header">
		<a href="/library" class="back-link">&larr; Back to Library</a>
		<h1>New Recipe</h1>
	</div>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	<form class="recipe-form" onsubmit={handleSubmit}>
		<div class="form-section">
			<div class="form-group">
				<label for="title">Title *</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					placeholder="Recipe title"
					required
				/>
			</div>

			<div class="form-group">
				<label for="description">Description</label>
				<textarea
					id="description"
					bind:value={description}
					placeholder="A brief description of the recipe"
					rows="3"
				></textarea>
			</div>
		</div>

		<div class="form-section">
			<h2>Timing</h2>
			<div class="form-row">
				<div class="form-group">
					<label for="prep-minutes">Prep (minutes)</label>
					<input
						id="prep-minutes"
						type="number"
						bind:value={prepMinutes}
						placeholder="0"
						min="0"
					/>
				</div>
				<div class="form-group">
					<label for="cook-minutes">Cook (minutes)</label>
					<input
						id="cook-minutes"
						type="number"
						bind:value={cookMinutes}
						placeholder="0"
						min="0"
					/>
				</div>
			</div>
		</div>

		<div class="form-section">
			<h2>Yield</h2>
			<div class="form-row">
				<div class="form-group">
					<label for="yield-quantity">Quantity</label>
					<input
						id="yield-quantity"
						type="number"
						bind:value={yieldQuantity}
						placeholder="4"
						min="1"
					/>
				</div>
				<div class="form-group">
					<label for="yield-unit">Unit</label>
					<input
						id="yield-unit"
						type="text"
						bind:value={yieldUnit}
						placeholder="servings"
					/>
				</div>
			</div>
		</div>

		<div class="form-section">
			<div class="form-group">
				<label for="notes">Notes</label>
				<textarea
					id="notes"
					bind:value={notes}
					placeholder="Additional notes"
					rows="3"
				></textarea>
			</div>
		</div>

		<div class="form-actions">
			<a href="/library" class="btn">Cancel</a>
			<button type="submit" class="btn btn-primary" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create Recipe'}
			</button>
		</div>
	</form>
</div>

<style>
	.new-recipe-page {
		max-width: 640px;
	}

	.page-header {
		margin-bottom: var(--space-6);
	}

	.back-link {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
		display: inline-block;
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
	}

	.recipe-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	.form-section h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--space-4);
	}

	.form-group {
		margin-bottom: var(--space-4);
	}

	.form-row {
		display: flex;
		gap: var(--space-4);
	}

	.form-row .form-group {
		flex: 1;
	}

	.form-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border-light);
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
