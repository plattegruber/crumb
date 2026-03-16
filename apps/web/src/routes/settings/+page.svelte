<script lang="ts">
</script>

<svelte:head>
	<title>Settings - crumb</title>
</svelte:head>

<div class="settings-page">
	<h1>Account Settings</h1>

	<div class="settings-grid">
		<a href="/settings/kit" class="settings-card card">
			<h3>Kit Connection</h3>
			<p>Connect or manage your Kit (ConvertKit) account integration.</p>
		</a>

		<a href="/settings/brand" class="settings-card card">
			<h3>Brand Kit</h3>
			<p>Configure colors, fonts, and logo for your digital products.</p>
		</a>

		<a href="/settings/team" class="settings-card card">
			<h3>Team</h3>
			<p>Manage team members and roles (Studio tier).</p>
		</a>
	</div>
</div>

<style>
	.settings-page {
		max-width: var(--max-content-width);
	}

	.settings-page h1 {
		font-size: var(--font-size-2xl);
		margin-bottom: var(--space-8);
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-4);
	}

	.settings-card {
		text-decoration: none;
		color: var(--color-text);
		transition: box-shadow var(--transition-fast);
	}

	.settings-card:hover {
		box-shadow: var(--shadow-md);
		color: var(--color-text);
	}

	.settings-card h3 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--space-2);
	}

	.settings-card p {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
	}
</style>
