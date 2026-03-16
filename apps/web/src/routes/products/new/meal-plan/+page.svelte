<script lang="ts">
</script>

<svelte:head>
  <title>New Meal Plan - dough</title>
</svelte:head>

<div class="stub-page">
  <a href="/products" class="back-link">&larr; Back to Products</a>
  <h1>Create Meal Plan</h1>
  <p>Build a structured meal plan with automated shopping list generation.</p>

  <div class="coming-soon card">
    <h3>Coming soon</h3>
    <p>This feature is under development. You will be able to:</p>
    <ul>
      <li>Plan meals for any number of days</li>
      <li>Assign breakfast, lunch, dinner, and snacks</li>
      <li>Auto-generate consolidated shopping lists</li>
      <li>Apply brand kit styling</li>
      <li>Export as PDF</li>
    </ul>
  </div>
</div>

<style>
  .stub-page {
    max-width: 640px;
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .stub-page h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .stub-page > p {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }

  .coming-soon h3 {
    margin-bottom: var(--space-2);
  }

  .coming-soon p {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .coming-soon ul {
    padding-left: var(--space-6);
    color: var(--color-text-secondary);
  }

  .coming-soon li {
    padding: var(--space-1) 0;
  }
</style>
