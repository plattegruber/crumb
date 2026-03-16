<script lang="ts">
	import type { DietaryTag } from '@crumb/shared';

	let { tag }: { tag: DietaryTag } = $props();

	const labels: Record<string, string> = {
		GlutenFree: 'Gluten-Free',
		DairyFree: 'Dairy-Free',
		Vegan: 'Vegan',
		Vegetarian: 'Vegetarian',
		Keto: 'Keto',
		Paleo: 'Paleo',
		NutFree: 'Nut-Free',
		EggFree: 'Egg-Free',
		SoyFree: 'Soy-Free',
	};

	let label = $derived(labels[tag] ?? tag);
</script>

<span class="badge" data-tag={tag}>{label}</span>

<style>
	.badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-xl);
		font-size: var(--font-size-xs);
		font-weight: 600;
		line-height: 1.5;
		white-space: nowrap;
	}

	.badge[data-tag='GlutenFree'] {
		background: #fff4e6;
		color: var(--color-tag-gluten-free);
	}

	.badge[data-tag='DairyFree'] {
		background: #edf2ff;
		color: var(--color-tag-dairy-free);
	}

	.badge[data-tag='Vegan'] {
		background: #ebfbee;
		color: var(--color-tag-vegan);
	}

	.badge[data-tag='Vegetarian'] {
		background: #ebfbee;
		color: var(--color-tag-vegetarian);
	}

	.badge[data-tag='Keto'] {
		background: #f3f0ff;
		color: var(--color-tag-keto);
	}

	.badge[data-tag='Paleo'] {
		background: #f8f0fc;
		color: var(--color-tag-paleo);
	}

	.badge[data-tag='NutFree'] {
		background: #fff4e6;
		color: var(--color-tag-nut-free);
	}

	.badge[data-tag='EggFree'] {
		background: #fff9db;
		color: var(--color-tag-egg-free);
	}

	.badge[data-tag='SoyFree'] {
		background: #e6fcf5;
		color: var(--color-tag-soy-free);
	}
</style>
