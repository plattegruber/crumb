<script lang="ts">
</script>

<svelte:head>
  <title>Kit Connection - dough</title>
</svelte:head>

<div class="settings-subpage">
  <a href="/settings" class="back-link">&larr; Back to Settings</a>
  <h1>Kit Connection</h1>
  <p class="page-description">
    Connect your Kit (ConvertKit) account to enable subscriber segmentation, automation, and product
    publishing.
  </p>

  <div class="card">
    <h3>Connect Kit</h3>
    <p>Click the button below to authorize dough to access your Kit account via OAuth.</p>
    <p class="scopes-note">
      We request read/write access to subscribers, tags, broadcasts, sequences, and forms.
    </p>
    <button class="btn btn-primary" disabled>Connect Kit Account</button>
    <p class="coming-soon">OAuth flow is under development.</p>
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
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .scopes-note {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .coming-soon {
    margin-top: var(--space-3);
    font-style: italic;
    color: var(--color-text-muted);
  }
</style>
