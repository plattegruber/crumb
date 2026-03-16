<script lang="ts">
</script>

<svelte:head>
  <title>New Ebook - dough</title>
</svelte:head>

<div class="stub-page">
  <a href="/products" class="back-link">&larr; Back to Products</a>
  <h1>Create Ebook</h1>
  <p>
    The ebook builder wizard will guide you through selecting recipes, organizing chapters, and
    configuring your brand kit.
  </p>

  <div class="coming-soon card">
    <h3>Coming soon</h3>
    <p>This feature is under development. You will be able to:</p>
    <ul>
      <li>Select recipes from your library</li>
      <li>Organize into chapters</li>
      <li>Choose a template and brand kit</li>
      <li>Generate PDF and EPUB files</li>
      <li>Publish to Kit, Stan Store, or Gumroad</li>
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
