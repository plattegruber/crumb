<script lang="ts">
  import { onMount } from "svelte";
  import { settings, type WordPressStatus, ApiError } from "$lib/api.js";

  let wpStatus = $state<WordPressStatus | null>(null);
  let loading = $state(true);
  let actionLoading = $state(false);
  let testing = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let testResult = $state<{ success: boolean; message: string } | null>(null);

  // Form fields
  let siteUrl = $state("");
  let apiKey = $state("");
  let plugin = $state("WpRecipeMaker");

  const isConnected = $derived(wpStatus?.connected === true);

  const PLUGIN_OPTIONS = [
    { value: "WpRecipeMaker", label: "WP Recipe Maker" },
    { value: "TastyRecipes", label: "Tasty Recipes" },
  ];

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      wpStatus = await settings.getWordPressStatus();
      if (wpStatus.site_url) {
        siteUrl = wpStatus.site_url;
      }
      if (wpStatus.plugin) {
        plugin = wpStatus.plugin;
      }
    } catch (e) {
      console.error("Failed to load WordPress status:", e);
      error = "Failed to load WordPress connection status.";
    } finally {
      loading = false;
    }
  }

  async function handleTestConnection() {
    if (!siteUrl.trim() || !apiKey.trim()) {
      error = "Site URL and application password are required.";
      return;
    }

    testing = true;
    error = null;
    testResult = null;

    try {
      testResult = await settings.testWordPress(siteUrl.trim(), apiKey.trim());
    } catch (e) {
      console.error("Test failed:", e);
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown>;
        testResult = {
          success: false,
          message: (body?.message as string) ?? "Connection test failed.",
        };
      } else {
        testResult = { success: false, message: "Connection test failed." };
      }
    } finally {
      testing = false;
    }
  }

  async function handleConnect() {
    if (!siteUrl.trim() || !apiKey.trim()) {
      error = "Site URL and application password are required.";
      return;
    }

    actionLoading = true;
    error = null;
    successMessage = null;

    try {
      const res = await settings.connectWordPress(siteUrl.trim(), apiKey.trim(), plugin);
      wpStatus = res;
      successMessage = "WordPress connected successfully!";
      apiKey = ""; // Clear the password from the form
    } catch (e) {
      console.error("Failed to connect WordPress:", e);
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown>;
        error = (body?.error as string) ?? "Failed to connect WordPress.";
      } else {
        error = "Failed to connect WordPress.";
      }
    } finally {
      actionLoading = false;
    }
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect your WordPress site?")) {
      return;
    }

    actionLoading = true;
    error = null;

    try {
      await settings.disconnectWordPress();
      wpStatus = { connected: false, site_url: null, plugin: null, connected_at: null };
      siteUrl = "";
      apiKey = "";
      successMessage = "WordPress disconnected successfully.";
    } catch (e) {
      console.error("Failed to disconnect WordPress:", e);
      error = "Failed to disconnect WordPress.";
    } finally {
      actionLoading = false;
    }
  }

  onMount(() => {
    void fetchStatus();
  });
</script>

<svelte:head>
  <title>WordPress Sync - dough</title>
</svelte:head>

<div class="settings-subpage">
  <a href="/settings" class="back-link">&larr; Back to Settings</a>
  <h1>WordPress Sync</h1>
  <p class="page-description">
    Connect your WordPress blog to automatically sync recipes into your dough library.
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
      <p>Loading WordPress status...</p>
    </div>
  {:else if isConnected && wpStatus}
    <!-- Connected state -->
    <div class="card connected-card">
      <div class="status-header">
        <span class="status-indicator connected"></span>
        <h3>Connected</h3>
      </div>

      <div class="connection-details">
        {#if wpStatus.site_url}
          <div class="detail-row">
            <span class="detail-label">Site URL</span>
            <span class="detail-value">
              <a href={wpStatus.site_url} target="_blank" rel="noopener noreferrer">
                {wpStatus.site_url}
              </a>
            </span>
          </div>
        {/if}

        {#if wpStatus.plugin}
          <div class="detail-row">
            <span class="detail-label">Recipe Plugin</span>
            <span class="detail-value">
              {PLUGIN_OPTIONS.find((p) => p.value === wpStatus?.plugin)?.label ?? wpStatus.plugin}
            </span>
          </div>
        {/if}

        {#if wpStatus.connected_at}
          <div class="detail-row">
            <span class="detail-label">Connected</span>
            <span class="detail-value">
              {new Date(wpStatus.connected_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        {/if}
      </div>

      <div class="card-actions">
        <button class="btn btn-danger" onclick={handleDisconnect} disabled={actionLoading}>
          {actionLoading ? "Disconnecting..." : "Disconnect"}
        </button>
      </div>
    </div>
  {:else}
    <!-- Connection form -->
    <div class="card form-section">
      <h3>Connect WordPress</h3>
      <p class="section-description">
        Enter your WordPress site URL and an application password to enable recipe syncing. You can
        create an application password in your WordPress admin under Users &gt; Profile &gt;
        Application Passwords.
      </p>

      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleConnect();
        }}
      >
        <div class="form-group">
          <label for="site-url">WordPress Site URL</label>
          <input
            type="url"
            id="site-url"
            bind:value={siteUrl}
            placeholder="https://myblog.com"
            required
          />
        </div>

        <div class="form-group">
          <label for="api-key">Application Password</label>
          <input
            type="text"
            id="api-key"
            bind:value={apiKey}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            required
          />
          <span class="field-help">
            Generate this in WordPress: Users &gt; Profile &gt; Application Passwords
          </span>
        </div>

        <div class="form-group">
          <label for="recipe-plugin">Recipe Plugin</label>
          <select id="recipe-plugin" bind:value={plugin}>
            {#each PLUGIN_OPTIONS as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>

        {#if testResult}
          <div
            class="test-result"
            class:test-success={testResult.success}
            class:test-failure={!testResult.success}
          >
            <p>{testResult.message}</p>
          </div>
        {/if}

        <div class="form-actions">
          <button
            type="button"
            class="btn"
            onclick={handleTestConnection}
            disabled={testing || !siteUrl.trim() || !apiKey.trim()}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={actionLoading || !siteUrl.trim() || !apiKey.trim()}
          >
            {actionLoading ? "Connecting..." : "Connect"}
          </button>
        </div>
      </form>
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

  .form-section {
    margin-bottom: var(--space-4);
  }

  .form-section h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  .section-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-4);
  }

  .form-group {
    margin-bottom: var(--space-4);
  }

  .form-group label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    margin-bottom: var(--space-1);
  }

  .field-help {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .test-result {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .test-success {
    background: var(--color-success-light);
    color: var(--color-success);
  }

  .test-failure {
    background: var(--color-danger-light);
    color: var(--color-danger);
  }

  .form-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
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

  .card-actions {
    margin-top: var(--space-4);
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

    .form-actions {
      flex-direction: column;
    }

    .form-actions button {
      width: 100%;
    }
  }
</style>
