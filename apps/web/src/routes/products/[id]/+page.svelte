<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import type { Product } from "@dough/shared";
  import { products } from "$lib/api.js";

  let product = $state<Product | null>(null);
  let loading = $state(true);

  const productId = $derived($page.params.id ?? "");

  onMount(async () => {
    try {
      product = await products.get(productId);
    } catch (e) {
      console.error("Failed to load product:", e);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{product?.base.title ?? "Product"} - dough</title>
</svelte:head>

<div class="product-detail">
  <a href="/products" class="back-link">&larr; Back to Products</a>

  {#if loading}
    <p class="loading">Loading product...</p>
  {:else if product}
    <div class="product-header">
      <span class="product-type">{product.type}</span>
      <h1>{product.base.title}</h1>
      {#if product.base.description}
        <p class="description">{product.base.description}</p>
      {/if}
      <span class="product-status" data-status={product.base.status}>
        {product.base.status}
      </span>
    </div>

    <div class="coming-soon card">
      <p>Full product detail view is under development.</p>
    </div>
  {:else}
    <div class="empty-state">
      <h3>Product not found</h3>
      <a href="/products" class="btn">Return to Products</a>
    </div>
  {/if}
</div>

<style>
  .product-detail {
    max-width: 780px;
  }

  .back-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .product-header {
    margin-bottom: var(--space-6);
  }

  .product-type {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    display: block;
    margin-bottom: var(--space-2);
  }

  .product-header h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--space-2);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .product-status[data-status="Published"] {
    color: var(--color-success);
  }

  .product-status[data-status="Draft"] {
    color: var(--color-warning);
  }

  .coming-soon {
    color: var(--color-text-secondary);
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    color: var(--color-text);
    margin-bottom: var(--space-4);
  }
</style>
