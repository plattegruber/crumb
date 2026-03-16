<script lang="ts">
  import type { Recipe, DietaryTag } from "@dough/shared";
  import DietaryBadge from "./DietaryBadge.svelte";

  const { recipe }: { recipe: Recipe } = $props();

  const heroPhoto = $derived(recipe.photos.length > 0 ? recipe.photos[0] : null);

  const dietaryTags = $derived.by((): DietaryTag[] => {
    const tags = recipe.classification.dietary.tags;
    // tags is a ReadonlySet -- convert to array
    if (
      tags instanceof Set ||
      (tags && typeof (tags as Iterable<DietaryTag>)[Symbol.iterator] === "function")
    ) {
      return [...tags] as DietaryTag[];
    }
    return [];
  });

  const totalTime = $derived(recipe.timing.total_minutes);

  const statusLabel = $derived.by(() => {
    switch (recipe.status) {
      case "Draft":
        return "Draft";
      case "Active":
        return "Active";
      case "Archived":
        return "Archived";
      default:
        return recipe.status;
    }
  });

  function formatTime(minutes: number | null): string {
    if (minutes === null) return "";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
</script>

<a href="/library/{recipe.id}" class="recipe-card">
  <div class="card-image">
    {#if heroPhoto}
      <img src={heroPhoto.url} alt={heroPhoto.alt_text ?? recipe.title} />
    {:else}
      <div class="placeholder-image">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          opacity="0.3"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
    {/if}
    <span class="status-badge" data-status={recipe.status}>{statusLabel}</span>
  </div>

  <div class="card-body">
    <h3 class="card-title">{recipe.title}</h3>

    {#if recipe.description}
      <p class="card-description">{recipe.description}</p>
    {/if}

    <div class="card-meta">
      {#if totalTime !== null}
        <span class="meta-item">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {formatTime(totalTime)}
        </span>
      {/if}

      {#if recipe.yield}
        <span class="meta-item">
          Serves {recipe.yield.quantity}
        </span>
      {/if}
    </div>

    {#if dietaryTags.length > 0}
      <div class="card-tags">
        {#each dietaryTags as tag (tag)}
          <DietaryBadge {tag} />
        {/each}
      </div>
    {/if}
  </div>
</a>

<style>
  .recipe-card {
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-lg);
    overflow: hidden;
    text-decoration: none;
    color: var(--color-text);
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .recipe-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
    color: var(--color-text);
  }

  .card-image {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background: var(--color-bg-tertiary);
  }

  .card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-badge {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: 600;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);
  }

  .status-badge[data-status="Active"] {
    color: var(--color-success);
  }

  .status-badge[data-status="Draft"] {
    color: var(--color-warning);
  }

  .status-badge[data-status="Archived"] {
    color: var(--color-text-muted);
  }

  .card-body {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
  }

  .card-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    display: flex;
    gap: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: auto;
  }
</style>
