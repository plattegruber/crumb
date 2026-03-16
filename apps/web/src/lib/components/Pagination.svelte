<script lang="ts">
	let {
		page,
		totalPages,
		onPageChange,
	}: {
		page: number;
		totalPages: number;
		onPageChange: (page: number) => void;
	} = $props();

	let pages = $derived.by(() => {
		const result: (number | 'ellipsis')[] = [];
		const maxVisible = 7;

		if (totalPages <= maxVisible) {
			for (let i = 1; i <= totalPages; i++) {
				result.push(i);
			}
			return result;
		}

		// Always show first page
		result.push(1);

		const start = Math.max(2, page - 1);
		const end = Math.min(totalPages - 1, page + 1);

		if (start > 2) {
			result.push('ellipsis');
		}

		for (let i = start; i <= end; i++) {
			result.push(i);
		}

		if (end < totalPages - 1) {
			result.push('ellipsis');
		}

		// Always show last page
		result.push(totalPages);

		return result;
	});

	let hasPrev = $derived(page > 1);
	let hasNext = $derived(page < totalPages);
</script>

{#if totalPages > 1}
	<nav class="pagination" aria-label="Page navigation">
		<button
			class="page-btn"
			disabled={!hasPrev}
			onclick={() => onPageChange(page - 1)}
			aria-label="Previous page"
		>
			Previous
		</button>

		<div class="page-numbers">
			{#each pages as p, i (i)}
				{#if p === 'ellipsis'}
					<span class="ellipsis">...</span>
				{:else}
					<button
						class={['page-num', { active: p === page }]}
						onclick={() => onPageChange(p)}
						aria-label={`Page ${p}`}
						aria-current={p === page ? 'page' : undefined}
					>
						{p}
					</button>
				{/if}
			{/each}
		</div>

		<button
			class="page-btn"
			disabled={!hasNext}
			onclick={() => onPageChange(page + 1)}
			aria-label="Next page"
		>
			Next
		</button>
	</nav>
{/if}

<style>
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		margin-top: var(--space-8);
	}

	.page-btn {
		padding: var(--space-2) var(--space-4);
		font-size: var(--font-size-sm);
	}

	.page-numbers {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.page-num {
		width: 36px;
		height: 36px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}

	.page-num.active {
		background: var(--color-primary);
		color: var(--color-primary-text);
		border-color: var(--color-primary);
	}

	.ellipsis {
		width: 36px;
		text-align: center;
		color: var(--color-text-muted);
	}
</style>
