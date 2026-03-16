<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Recipe, DietaryTag } from '@crumb/shared';
	import { recipes } from '$lib/api.js';
	import DietaryBadge from '$lib/components/DietaryBadge.svelte';

	let recipe = $state<Recipe | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let deleting = $state(false);

	let recipeId = $derived($page.params.id ?? '');

	let dietaryTags = $derived.by((): DietaryTag[] => {
		if (!recipe) return [];
		const tags = recipe.classification.dietary.tags;
		if (tags instanceof Set || (tags && typeof (tags as Iterable<DietaryTag>)[Symbol.iterator] === 'function')) {
			return [...tags] as DietaryTag[];
		}
		return [];
	});

	async function fetchRecipe() {
		loading = true;
		error = null;
		try {
			recipe = await recipes.get(recipeId);
		} catch (e) {
			error = 'Failed to load recipe.';
			console.error(e);
		} finally {
			loading = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Are you sure you want to archive this recipe?')) return;
		deleting = true;
		try {
			await recipes.delete(recipeId);
			await goto('/library');
		} catch (e) {
			error = 'Failed to delete recipe.';
			console.error(e);
		} finally {
			deleting = false;
		}
	}

	function formatTime(minutes: number | null): string {
		if (minutes === null) return '--';
		if (minutes < 60) return `${minutes} min`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	function formatQuantity(q: { type: string; value?: number; numerator?: number; denominator?: number; whole?: number } | null): string {
		if (!q) return '';
		switch (q.type) {
			case 'WholeNumber':
				return String(q.value ?? '');
			case 'Fraction':
				return `${q.numerator}/${q.denominator}`;
			case 'Mixed':
				return `${q.whole} ${q.numerator}/${q.denominator}`;
			case 'Decimal':
				return String(q.value ?? '');
			default:
				return '';
		}
	}

	onMount(() => {
		void fetchRecipe();
	});
</script>

<svelte:head>
	<title>{recipe?.title ?? 'Recipe'} - crumb</title>
</svelte:head>

<div class="recipe-detail">
	<a href="/library" class="back-link">&larr; Back to Library</a>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	{#if loading}
		<div class="loading">Loading recipe...</div>
	{:else if recipe}
		<div class="recipe-header">
			<div class="recipe-header-text">
				<h1>{recipe.title}</h1>
				{#if recipe.description}
					<p class="description">{recipe.description}</p>
				{/if}
				<div class="recipe-status" data-status={recipe.status}>
					{recipe.status}
					{#if recipe.email_ready}
						<span class="email-ready">Email Ready</span>
					{/if}
				</div>
			</div>

			<div class="recipe-actions">
				<button class="btn btn-danger" onclick={handleDelete} disabled={deleting}>
					{deleting ? 'Archiving...' : 'Archive'}
				</button>
			</div>
		</div>

		<!-- Hero photo -->
		{#if recipe.photos.length > 0 && recipe.photos[0]}
			<div class="hero-photo">
				<img src={recipe.photos[0].url} alt={recipe.photos[0].alt_text ?? recipe.title} />
			</div>
		{/if}

		<!-- Timing & yield -->
		<div class="meta-row">
			<div class="meta-card">
				<span class="meta-label">Prep</span>
				<span class="meta-value">{formatTime(recipe.timing.prep_minutes)}</span>
			</div>
			<div class="meta-card">
				<span class="meta-label">Cook</span>
				<span class="meta-value">{formatTime(recipe.timing.cook_minutes)}</span>
			</div>
			<div class="meta-card">
				<span class="meta-label">Total</span>
				<span class="meta-value">{formatTime(recipe.timing.total_minutes)}</span>
			</div>
			{#if recipe.yield}
				<div class="meta-card">
					<span class="meta-label">Yield</span>
					<span class="meta-value">{recipe.yield.quantity} {recipe.yield.unit}</span>
				</div>
			{/if}
		</div>

		<!-- Dietary tags -->
		{#if dietaryTags.length > 0}
			<div class="tags-section">
				{#each dietaryTags as tag (tag)}
					<DietaryBadge {tag} />
				{/each}
			</div>
		{/if}

		<!-- Ingredients -->
		{#if recipe.ingredients.length > 0}
			<section class="recipe-section">
				<h2>Ingredients</h2>
				{#each recipe.ingredients as group}
					{#if group.label}
						<h3 class="group-label">{group.label}</h3>
					{/if}
					<ul class="ingredient-list">
						{#each group.ingredients as ingredient (ingredient.id)}
							<li>
								{#if ingredient.quantity}
									<span class="ingredient-qty">{formatQuantity(ingredient.quantity)}</span>
								{/if}
								{#if ingredient.unit}
									<span class="ingredient-unit">{ingredient.unit}</span>
								{/if}
								<span class="ingredient-item">{ingredient.item}</span>
								{#if ingredient.notes}
									<span class="ingredient-notes">, {ingredient.notes}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/each}
			</section>
		{/if}

		<!-- Instructions -->
		{#if recipe.instructions.length > 0}
			<section class="recipe-section">
				<h2>Instructions</h2>
				{#each recipe.instructions as group}
					{#if group.label}
						<h3 class="group-label">{group.label}</h3>
					{/if}
					<ol class="instruction-list">
						{#each group.instructions as instruction (instruction.id)}
							<li>{instruction.body}</li>
						{/each}
					</ol>
				{/each}
			</section>
		{/if}

		<!-- Notes -->
		{#if recipe.notes}
			<section class="recipe-section">
				<h2>Notes</h2>
				<p>{recipe.notes}</p>
			</section>
		{/if}

		<!-- Classification -->
		{#if recipe.classification.cuisine || recipe.classification.meal_types}
			<section class="recipe-section">
				<h2>Classification</h2>
				<div class="classification-grid">
					{#if recipe.classification.cuisine}
						<div>
							<span class="meta-label">Cuisine</span>
							<span>{recipe.classification.cuisine}</span>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	{:else}
		<div class="empty-state">
			<h3>Recipe not found</h3>
			<p>This recipe may have been deleted.</p>
			<a href="/library" class="btn">Return to Library</a>
		</div>
	{/if}
</div>

<style>
	.recipe-detail {
		max-width: 780px;
	}

	.back-link {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		display: inline-block;
		margin-bottom: var(--space-4);
	}

	.recipe-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.recipe-header h1 {
		font-size: var(--font-size-2xl);
		margin-bottom: var(--space-2);
	}

	.description {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.recipe-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.recipe-status[data-status='Active'] {
		color: var(--color-success);
	}

	.recipe-status[data-status='Draft'] {
		color: var(--color-warning);
	}

	.email-ready {
		padding: 2px 6px;
		background: var(--color-success-light);
		color: var(--color-success);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
	}

	.recipe-actions {
		flex-shrink: 0;
	}

	.hero-photo {
		border-radius: var(--radius-lg);
		overflow: hidden;
		margin-bottom: var(--space-6);
		aspect-ratio: 16 / 9;
	}

	.hero-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.meta-row {
		display: flex;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
		flex-wrap: wrap;
	}

	.meta-card {
		display: flex;
		flex-direction: column;
		padding: var(--space-3) var(--space-4);
		background: var(--color-bg-secondary);
		border-radius: var(--radius-md);
		min-width: 100px;
	}

	.meta-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.meta-value {
		font-size: var(--font-size-lg);
		font-weight: 600;
	}

	.tags-section {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-6);
	}

	.recipe-section {
		margin-bottom: var(--space-8);
	}

	.recipe-section h2 {
		font-size: var(--font-size-xl);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-light);
	}

	.group-label {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-top: var(--space-4);
		margin-bottom: var(--space-2);
	}

	.ingredient-list {
		list-style: none;
		padding: 0;
	}

	.ingredient-list li {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-light);
	}

	.ingredient-qty {
		font-weight: 600;
	}

	.ingredient-unit {
		color: var(--color-text-secondary);
		margin-right: var(--space-1);
	}

	.ingredient-notes {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.instruction-list {
		padding-left: var(--space-6);
	}

	.instruction-list li {
		padding: var(--space-2) 0;
		line-height: 1.6;
	}

	.classification-grid {
		display: flex;
		gap: var(--space-6);
	}

	.loading {
		text-align: center;
		padding: var(--space-16);
		color: var(--color-text-secondary);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-16);
	}

	.empty-state h3 {
		margin-bottom: var(--space-2);
	}

	.empty-state p {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
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
		.recipe-header {
			flex-direction: column;
		}

		.meta-row {
			flex-direction: column;
			gap: var(--space-2);
		}
	}
</style>
