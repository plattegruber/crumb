<script lang="ts">
</script>

<svelte:head>
	<title>Brand Kit - crumb</title>
</svelte:head>

<div class="settings-subpage">
	<a href="/settings" class="back-link">&larr; Back to Settings</a>
	<h1>Brand Kit</h1>
	<p class="page-description">Customize the look and feel of your recipe cards and digital products.</p>

	<div class="card">
		<h3>Branding</h3>
		<p>Configure your brand colors, fonts, and logo. These settings apply to recipe cards, ebooks, and meal plans.</p>
		<p class="coming-soon">Brand Kit editor is under development.</p>
	</div>
</div>

<style>
	.settings-subpage {
		max-width: 640px;
	}

	.back-link {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		display: inline-block;
		margin-bottom: var(--space-4);
	}

	.settings-subpage h1 {
		font-size: var(--font-size-2xl);
		margin-bottom: var(--space-2);
	}

	.page-description {
		color: var(--color-text-secondary);
		margin-bottom: var(--space-8);
	}

	.card h3 {
		margin-bottom: var(--space-2);
	}

	.card p {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin-bottom: var(--space-4);
	}

	.coming-soon {
		font-style: italic;
		color: var(--color-text-muted);
	}
</style>
