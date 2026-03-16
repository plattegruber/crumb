<script lang="ts">
</script>

<svelte:head>
  <title>Grow - dough</title>
</svelte:head>

<div class="grow-page">
  <h1>Grow Dashboard</h1>
  <p class="page-description">Understand your audience and grow your email list.</p>

  <div class="dashboard-grid">
    <a href="/grow/segments" class="dashboard-card card">
      <h3>Segments</h3>
      <p>See dietary preference breakdown of your subscriber list.</p>
    </a>

    <a href="/grow/analytics" class="dashboard-card card">
      <h3>Analytics</h3>
      <p>Engagement scores, top recipes, and product recommendations.</p>
    </a>

    <a href="/grow/automation" class="dashboard-card card">
      <h3>Automation</h3>
      <p>Seasonal drops, sequences, and broadcast automation.</p>
    </a>
  </div>
</div>

<style>
  .grow-page {
    max-width: var(--max-content-width);
  }

  .grow-page h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .page-description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-8);
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .dashboard-card {
    text-decoration: none;
    color: var(--color-text);
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .dashboard-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
    color: var(--color-text);
  }

  .dashboard-card h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  .dashboard-card p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }
</style>
