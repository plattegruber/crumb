<script lang="ts">
  import { onMount } from "svelte";
  import type { Collection } from "@crumb/shared";
  import { collections } from "$lib/api.js";

  let collectionList = $state<Collection[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let showCreateForm = $state(false);
  let newName = $state("");
  let newDescription = $state("");
  let creating = $state(false);

  async function fetchCollections() {
    loading = true;
    error = null;
    try {
      collectionList = await collections.list();
    } catch (e) {
      error = "Failed to load collections.";
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!newName.trim()) return;

    creating = true;
    try {
      await collections.create({
        name: newName.trim(),
        description: newDescription.trim() || null,
      });
      newName = "";
      newDescription = "";
      showCreateForm = false;
      await fetchCollections();
    } catch (e) {
      error = "Failed to create collection.";
      console.error(e);
    } finally {
      creating = false;
    }
  }

  onMount(() => {
    void fetchCollections();
  });
</script>

<svelte:head>
  <title>Collections - crumb</title>
</svelte:head>

<div class="collections-page">
  <div class="page-header">
    <h1>Collections</h1>
    <button class="btn btn-primary" onclick={() => (showCreateForm = !showCreateForm)}>
      {showCreateForm ? "Cancel" : "New Collection"}
    </button>
  </div>

  {#if showCreateForm}
    <form class="create-form card" onsubmit={handleCreate}>
      <div class="form-group">
        <label for="collection-name">Name</label>
        <input
          id="collection-name"
          type="text"
          bind:value={newName}
          placeholder="Collection name"
          required
        />
      </div>
      <div class="form-group">
        <label for="collection-desc">Description (optional)</label>
        <input
          id="collection-desc"
          type="text"
          bind:value={newDescription}
          placeholder="Brief description"
        />
      </div>
      <button type="submit" class="btn btn-primary" disabled={creating}>
        {creating ? "Creating..." : "Create"}
      </button>
    </form>
  {/if}

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <p class="loading">Loading collections...</p>
  {:else if collectionList.length === 0}
    <div class="empty-state">
      <h3>No collections yet</h3>
      <p>Organize your recipes into collections for easier browsing and product building.</p>
    </div>
  {:else}
    <div class="collection-grid">
      {#each collectionList as collection (collection.id)}
        <div class="collection-card card">
          <h3>{collection.name}</h3>
          {#if collection.description}
            <p class="collection-desc">{collection.description}</p>
          {/if}
          <p class="collection-meta">
            {collection.recipe_ids.length} recipe{collection.recipe_ids.length === 1 ? "" : "s"}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .collections-page {
    max-width: var(--max-content-width);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
  }

  .create-form {
    margin-bottom: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  .collection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .collection-card h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  .collection-desc {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-2);
  }

  .collection-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    color: var(--color-text);
    margin-bottom: var(--space-2);
  }

  .error-banner {
    padding: var(--space-3) var(--space-4);
    background: var(--color-danger-light);
    color: var(--color-danger);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
  }
</style>
