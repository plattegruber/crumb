<script lang="ts">
  import { onMount } from "svelte";
  import type { Product } from "@crumb/shared";
  import { products } from "$lib/api.js";

  let productList = $state<Product[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      productList = await products.list();
    } catch (e) {
      console.error("Failed to load products:", e);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Products - crumb</title>
</svelte:head>

<div class="products-page">
  <div class="page-header">
    <h1>Products</h1>
    <div class="header-actions">
      <a href="/products/new/ebook" class="btn btn-primary">New Ebook</a>
      <a href="/products/new/meal-plan" class="btn">New Meal Plan</a>
    </div>
  </div>

  {#if loading}
    <p class="loading">Loading products...</p>
  {:else if productList.length === 0}
    <div class="empty-state">
      <h3>No products yet</h3>
      <p>Create ebooks, meal plans, and recipe card packs from your recipe library.</p>
      <div class="empty-actions">
        <a href="/products/new/ebook" class="btn btn-primary">Create Ebook</a>
        <a href="/products/new/meal-plan" class="btn">Create Meal Plan</a>
      </div>
    </div>
  {:else}
    <div class="product-grid">
      {#each productList as product (product.base.id)}
        <a href="/products/{product.base.id}" class="product-card card">
          <span class="product-type">{product.type}</span>
          <h3>{product.base.title}</h3>
          {#if product.base.description}
            <p>{product.base.description}</p>
          {/if}
          <span class="product-status" data-status={product.base.status}>
            {product.base.status}
          </span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .products-page {
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

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-4);
  }

  .product-card {
    text-decoration: none;
    color: var(--color-text);
    transition: box-shadow var(--transition-fast);
  }

  .product-card:hover {
    box-shadow: var(--shadow-md);
    color: var(--color-text);
  }

  .product-type {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    margin-bottom: var(--space-2);
    display: block;
  }

  .product-card h3 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  .product-card p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-3);
  }

  .product-status {
    font-size: var(--font-size-xs);
    font-weight: 600;
  }

  .product-status[data-status="Published"] {
    color: var(--color-success);
  }

  .product-status[data-status="Draft"] {
    color: var(--color-warning);
  }

  .loading,
  .empty-state {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    color: var(--color-text);
    margin-bottom: var(--space-2);
  }

  .empty-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    margin-top: var(--space-6);
  }
</style>
