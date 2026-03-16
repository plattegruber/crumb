<script lang="ts">
</script>

<svelte:head>
	<title>Team - crumb</title>
</svelte:head>

<div class="settings-subpage">
	<a href="/settings" class="back-link">&larr; Back to Settings</a>
	<h1>Team Management</h1>
	<p class="page-description">Invite team members and manage roles. Available on the Studio tier.</p>

	<div class="card">
		<h3>Team Members</h3>
		<p>Add team members to collaborate on your recipe library and products.</p>
		<p class="coming-soon">Team management is under development and requires the Studio subscription tier.</p>
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
