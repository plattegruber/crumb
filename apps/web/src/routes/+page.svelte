<script lang="ts">
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>dough - Recipe intelligence for food creators</title>
  <meta name="description" content="Recipe intelligence for food creators" />
</svelte:head>

{#if data.userId}
  <!-- Authenticated users are redirected to /library by the layout -->
  <div class="dashboard">
    <h1>Welcome to dough</h1>
    <p>Get started by heading to your <a href="/library">Recipe Library</a>.</p>
  </div>
{:else}
  <div class="landing">
    <div class="landing-content">
      <h1>dough</h1>
      <p class="tagline">Recipe intelligence for food creators.</p>
      <p class="description">
        Import your recipes, build digital products, grow your email list with dietary segmentation,
        and understand what content drives engagement.
      </p>
      <div class="cta-buttons">
        <a href="/sign-up" class="btn btn-primary btn-lg">Get Started</a>
        <a href="/sign-in" class="btn btn-lg">Sign In</a>
      </div>
    </div>
  </div>
{/if}

<style>
  .dashboard {
    padding: var(--space-8);
  }

  .dashboard h1 {
    margin-bottom: var(--space-4);
  }

  .landing {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
  }

  .landing-content {
    text-align: center;
    max-width: 560px;
  }

  .landing-content h1 {
    font-size: 4rem;
    color: var(--color-primary);
    margin-bottom: var(--space-4);
  }

  .tagline {
    font-size: var(--font-size-xl);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-4);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-8);
    line-height: 1.6;
  }

  .cta-buttons {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
  }

  .btn-lg {
    padding: var(--space-3) var(--space-8);
    font-size: var(--font-size-base);
  }
</style>
