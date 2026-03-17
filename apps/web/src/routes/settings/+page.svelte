<script lang="ts">
  import { onMount } from "svelte";
  import { settings, type CreatorAccount } from "$lib/api.js";

  let creator = $state<CreatorAccount | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const tierLabel = $derived(
    creator
      ? ({
          Free: "Free",
          Creator: "Creator",
          Pro: "Pro",
          Studio: "Studio",
        }[creator.subscription_tier] ?? creator.subscription_tier)
      : "",
  );

  const tierColor = $derived(
    creator
      ? ({
          Free: "var(--color-text-muted)",
          Creator: "var(--color-primary)",
          Pro: "var(--color-success)",
          Studio: "var(--color-warning)",
        }[creator.subscription_tier] ?? "var(--color-text)")
      : "var(--color-text)",
  );

  onMount(async () => {
    try {
      const res = await settings.getAccount();
      creator = res.creator;
    } catch (e) {
      console.error("Failed to load account:", e);
      error = "Failed to load account information.";
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Settings - dough</title>
</svelte:head>

<div class="settings-page">
  <h1>Account Settings</h1>

  {#if loading}
    <div class="loading">
      <p>Loading account...</p>
    </div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {:else if creator}
    <div class="account-section card">
      <h3>Account</h3>
      <div class="account-info">
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">{creator.email || "Not set"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Name</span>
          <span class="info-value">{creator.name || "Not set"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Subscription</span>
          <span class="info-value">
            <span class="tier-badge" style="color: {tierColor}">{tierLabel}</span>
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Member since</span>
          <span class="info-value">
            {new Date(creator.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  {/if}

  <h2 class="section-heading">Settings</h2>

  <div class="settings-grid">
    <a href="/settings/kit" class="settings-card card">
      <div class="card-header">
        <h3>Kit Connection</h3>
        {#if creator?.kit_connected_at}
          <span class="status-dot connected" title="Connected"></span>
        {:else}
          <span class="status-dot disconnected" title="Not connected"></span>
        {/if}
      </div>
      <p>Connect or manage your Kit (ConvertKit) account integration.</p>
    </a>

    <a href="/settings/brand" class="settings-card card">
      <div class="card-header">
        <h3>Brand Kit</h3>
      </div>
      <p>Configure colors, fonts, and logo for your digital products.</p>
    </a>

    <a href="/settings/team" class="settings-card card">
      <div class="card-header">
        <h3>Team</h3>
      </div>
      <p>Manage team members and roles (Studio tier).</p>
    </a>

    <a href="/settings/wordpress" class="settings-card card">
      <div class="card-header">
        <h3>WordPress Sync</h3>
        {#if creator?.wordpress_connected_at}
          <span class="status-dot connected" title="Connected"></span>
        {:else}
          <span class="status-dot disconnected" title="Not connected"></span>
        {/if}
      </div>
      <p>Sync recipes from your WordPress blog.</p>
    </a>
  </div>
</div>

<style>
  .settings-page {
    max-width: var(--max-content-width);
  }

  .settings-page h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-6);
  }

  .section-heading {
    font-size: var(--font-size-xl);
    margin-top: var(--space-8);
    margin-bottom: var(--space-4);
  }

  .account-section {
    margin-bottom: var(--space-4);
  }

  .account-section h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-4);
  }

  .account-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .info-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    min-width: 120px;
    font-weight: 500;
  }

  .info-value {
    font-size: var(--font-size-sm);
  }

  .tier-badge {
    font-weight: 600;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .settings-card {
    text-decoration: none;
    color: var(--color-text);
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .settings-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
    color: var(--color-text);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .card-header h3 {
    font-size: var(--font-size-lg);
  }

  .settings-card p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.connected {
    background: var(--color-success);
  }

  .status-dot.disconnected {
    background: var(--color-border);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .error-message {
    text-align: center;
    padding: var(--space-8);
    background: var(--color-danger-light);
    border-radius: var(--radius-lg);
    color: var(--color-danger);
  }

  @media (max-width: 768px) {
    .info-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }

    .info-label {
      min-width: unset;
    }
  }
</style>
