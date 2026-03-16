<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getClerk } from "$lib/clerk.js";

  let mountEl: HTMLDivElement | undefined = $state();
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) {
      error = "Clerk is not configured. Set VITE_CLERK_PUBLISHABLE_KEY.";
      loading = false;
      return;
    }

    try {
      const clerk = await getClerk(publishableKey);

      if (clerk.user) {
        await goto("/library");
        return;
      }

      // Wait briefly for Clerk UI components to finish lazy-loading
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (mountEl) {
        try {
          clerk.mountSignIn(mountEl, {
            afterSignInUrl: "/library",
            afterSignUpUrl: "/library",
          });
        } catch {
          // If mount fails (UI not ready), retry after a longer delay
          await new Promise((resolve) => setTimeout(resolve, 1000));
          clerk.mountSignIn(mountEl, {
            afterSignInUrl: "/library",
            afterSignUpUrl: "/library",
          });
        }
      }
    } catch (e) {
      error = "Failed to load authentication.";
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Sign In - crumb</title>
</svelte:head>

<div class="auth-page">
  <div class="auth-container">
    <a href="/" class="auth-logo">crumb</a>

    {#if error}
      <div class="auth-error">
        <p>{error}</p>
      </div>
    {:else if loading}
      <p class="auth-loading">Loading...</p>
    {/if}

    <div bind:this={mountEl}></div>
  </div>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: var(--color-bg-secondary);
  }

  .auth-container {
    width: 100%;
    max-width: 480px;
    text-align: center;
  }

  .auth-logo {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;
    margin-bottom: var(--space-8);
  }

  .auth-loading {
    color: var(--color-text-secondary);
  }

  .auth-error {
    padding: var(--space-4);
    background: var(--color-danger-light);
    color: var(--color-danger);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }
</style>
