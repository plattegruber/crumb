<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { settings, type KitStatus, ApiError } from "$lib/api.js";

  let kitStatus = $state<KitStatus | null>(null);
  let loading = $state(true);
  let actionLoading = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  const isConnected = $derived(kitStatus?.connected === true);

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      kitStatus = await settings.getKitStatus();
    } catch (e) {
      console.error("Failed to load Kit status:", e);
      error = "Failed to load Kit connection status.";
    } finally {
      loading = false;
    }
  }

  async function handleConnect() {
    actionLoading = true;
    error = null;
    try {
      // The redirect URI for the OAuth callback is the current page
      const currentUrl = $page.url;
      const redirectUri = `${currentUrl.origin}${currentUrl.pathname}`;
      const { url } = await settings.getKitAuthUrl(redirectUri);
      // Redirect user to Kit's OAuth page
      window.location.href = url;
    } catch (e) {
      console.error("Failed to get auth URL:", e);
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown>;
        error = (body?.error as string) ?? "Failed to initiate Kit connection.";
      } else {
        error = "Failed to initiate Kit connection.";
      }
      actionLoading = false;
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect your Kit account?")) {
      return;
    }

    actionLoading = true;
    error = null;
    try {
      await settings.disconnectKit();
      kitStatus = {
        connected: false,
        account_id: null,
        connected_at: null,
        scopes: null,
        token_expires_at: null,
      };
      successMessage = "Kit account disconnected successfully.";
    } catch (e) {
      console.error("Failed to disconnect Kit:", e);
      error = "Failed to disconnect Kit account.";
    } finally {
      actionLoading = false;
    }
  }

  onMount(async () => {
    // Check if we're returning from an OAuth callback
    const urlParams = $page.url.searchParams;
    const code = urlParams.get("code");

    if (code) {
      // Exchange the code for tokens
      loading = true;
      try {
        const redirectUri = `${$page.url.origin}${$page.url.pathname}`;
        await settings.exchangeKitCode(code, redirectUri);
        successMessage = "Kit account connected successfully!";
        // Clean up URL params
        const cleanUrl = `${$page.url.origin}${$page.url.pathname}`;
        window.history.replaceState({}, "", cleanUrl);
      } catch (e) {
        console.error("Failed to exchange code:", e);
        error = "Failed to complete Kit connection. Please try again.";
      }
    }

    await fetchStatus();
  });
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

  {#if successMessage}
    <div class="success-banner">
      <p>{successMessage}</p>
      <button class="btn-ghost dismiss-btn" onclick={() => (successMessage = null)}>
        Dismiss
      </button>
    </div>
  {/if}

  {#if error}
    <div class="error-banner">
      <p>{error}</p>
      <button class="btn-ghost dismiss-btn" onclick={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">
      <p>Loading connection status...</p>
    </div>
  {:else if isConnected && kitStatus}
    <div class="card connected-card">
      <div class="status-header">
        <span class="status-indicator connected"></span>
        <h3>Connected</h3>
      </div>

      <div class="connection-details">
        {#if kitStatus.connected_at}
          <div class="detail-row">
            <span class="detail-label">Connected</span>
            <span class="detail-value">
              {new Date(kitStatus.connected_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        {/if}

        {#if kitStatus.scopes && kitStatus.scopes.length > 0}
          <div class="detail-row">
            <span class="detail-label">Permissions</span>
            <span class="detail-value">
              <div class="scopes-list">
                {#each kitStatus.scopes as scope (scope)}
                  <span class="scope-tag">{scope}</span>
                {/each}
              </div>
            </span>
          </div>
        {/if}

        {#if kitStatus.token_expires_at}
          <div class="detail-row">
            <span class="detail-label">Token expires</span>
            <span class="detail-value">
              {new Date(kitStatus.token_expires_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        {/if}
      </div>

      <div class="card-actions">
        <button class="btn btn-danger" onclick={handleDisconnect} disabled={actionLoading}>
          {actionLoading ? "Disconnecting..." : "Disconnect Kit Account"}
        </button>
      </div>
    </div>
  {:else}
    <div class="card">
      <h3>Connect Kit</h3>
      <p>Click the button below to authorize dough to access your Kit account via OAuth.</p>
      <p class="scopes-note">
        We request read/write access to subscribers, tags, broadcasts, sequences, and forms.
      </p>

      <div class="card-actions">
        <button class="btn btn-primary" onclick={handleConnect} disabled={actionLoading}>
          {actionLoading ? "Connecting..." : "Connect Kit Account"}
        </button>
      </div>
    </div>
  {/if}
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
    margin-bottom: var(--space-6);
  }

  .success-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-success-light);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    color: var(--color-success);
    font-size: var(--font-size-sm);
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    color: var(--color-danger);
    font-size: var(--font-size-sm);
  }

  .dismiss-btn {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
  }

  .card h3 {
    margin-bottom: var(--space-2);
  }

  .card p {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
    font-size: var(--font-size-sm);
  }

  .scopes-note {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .card-actions {
    margin-top: var(--space-4);
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .status-indicator.connected {
    background: var(--color-success);
  }

  .connected-card h3 {
    margin-bottom: 0;
  }

  .connection-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .detail-row {
    display: flex;
    gap: var(--space-4);
  }

  .detail-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    min-width: 120px;
    font-weight: 500;
  }

  .detail-value {
    font-size: var(--font-size-sm);
  }

  .scopes-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .scope-tag {
    display: inline-block;
    padding: 2px 6px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  @media (max-width: 768px) {
    .detail-row {
      flex-direction: column;
      gap: var(--space-1);
    }

    .detail-label {
      min-width: unset;
    }
  }
</style>
