<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import type { Recipe, DietaryTag, MealType, RecipeStatus } from '@crumb/shared';
	import { recipes, type ListRecipesParams } from '$lib/api.js';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import Pagination from '$lib/components/Pagination.svelte';

	let recipeList = $state<Recipe[]>([]);
	let total = $state(0);
	let currentPage = $state(1);
	let perPage = $state(24);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Extract initial filter state from URL params
	let searchQuery = $state('');
	let filterStatus = $state('');
	let filterMealType = $state('');
	let filterDietaryTags = $state<string[]>([]);

	let totalPages = $derived(Math.max(1, Math.ceil(total / perPage)));

	async function fetchRecipes() {
		loading = true;
		error = null;
		try {
			const params: ListRecipesParams = {
				page: currentPage,
				per_page: perPage,
			};

			if (searchQuery) params.q = searchQuery;
			if (filterStatus) params.status = filterStatus as RecipeStatus;
			if (filterMealType) params.meal_type = filterMealType as MealType;
			if (filterDietaryTags.length > 0)
				params.dietary_tags = filterDietaryTags as DietaryTag[];

			const res = await recipes.list(params);
			recipeList = res.recipes;
			total = res.total;
		} catch (e) {
			error = 'Failed to load recipes. Please try again.';
			console.error(e);
		} finally {
			loading = false;
		}
	}

	function handleSearch(params: {
		query: string;
		status: string;
		mealType: string;
		dietaryTags: string[];
	}) {
		searchQuery = params.query;
		filterStatus = params.status;
		filterMealType = params.mealType;
		filterDietaryTags = params.dietaryTags;
		currentPage = 1;
		void fetchRecipes();
	}

	function handlePageChange(newPage: number) {
		currentPage = newPage;
		void fetchRecipes();
	}

	onMount(() => {
		void fetchRecipes();
	});
</script>

<svelte:head>
	<title>Recipe Library - crumb</title>
</svelte:head>

<div class="library-page">
	<div class="page-header">
		<h1>Recipe Library</h1>
		<a href="/library/new" class="btn btn-primary">New Recipe</a>
	</div>

	<SearchBar onSearch={handleSearch} />

	{#if error}
		<div class="error-message">
			<p>{error}</p>
			<button class="btn" onclick={() => fetchRecipes()}>Retry</button>
		</div>
	{:else if loading}
		<div class="loading">
			<p>Loading recipes...</p>
		</div>
	{:else if recipeList.length === 0}
		<div class="empty-state">
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<polyline points="14 2 14 8 20 8" />
			</svg>
			<h3>No recipes yet</h3>
			<p>Create your first recipe or import from a URL.</p>
			<div class="empty-actions">
				<a href="/library/new" class="btn btn-primary">Create Recipe</a>
				<a href="/library/import" class="btn">Import Recipe</a>
			</div>
		</div>
	{:else}
		<div class="recipe-grid">
			{#each recipeList as recipe (recipe.id)}
				<RecipeCard {recipe} />
			{/each}
		</div>

		<Pagination
			page={currentPage}
			{totalPages}
			onPageChange={handlePageChange}
		/>

		<p class="result-count">{total} recipe{total === 1 ? '' : 's'} found</p>
	{/if}
</div>

<style>
	.library-page {
		max-width: var(--max-content-width);
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-6);
		gap: var(--space-4);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
	}

	.recipe-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-6);
	}

	.empty-state {
		text-align: center;
		padding: var(--space-16) var(--space-4);
		color: var(--color-text-secondary);
	}

	.empty-state h3 {
		margin-top: var(--space-4);
		margin-bottom: var(--space-2);
		color: var(--color-text);
	}

	.empty-state p {
		margin-bottom: var(--space-6);
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

	.error-message {
		text-align: center;
		padding: var(--space-8);
		background: var(--color-danger-light);
		border-radius: var(--radius-lg);
		color: var(--color-danger);
	}

	.error-message button {
		margin-top: var(--space-4);
	}

	.result-count {
		text-align: center;
		margin-top: var(--space-4);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	@media (max-width: 768px) {
		.page-header {
			flex-wrap: wrap;
		}

		.recipe-grid {
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		}
	}
</style>
