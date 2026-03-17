<script lang="ts">
  import { onMount } from "svelte";
  import { settings, type BrandKit, ApiError } from "$lib/api.js";

  let _brandKit = $state<BrandKit | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // Form fields
  let name = $state("My Brand");
  let logoUrl = $state("");
  let primaryColor = $state("#e85d04");
  let secondaryColor = $state("#6c757d");
  let accentColor = $state("#212529");
  let headingFontFamily = $state("Georgia");
  let bodyFontFamily = $state("system-ui");

  const FONT_OPTIONS = [
    "system-ui",
    "Georgia",
    "Garamond",
    "Palatino",
    "Merriweather",
    "Lora",
    "Playfair Display",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Raleway",
    "Poppins",
    "Inter",
    "Source Sans Pro",
    "Nunito",
    "DM Sans",
    "Work Sans",
  ];

  function populateForm(kit: BrandKit) {
    name = kit.name;
    logoUrl = kit.logo_url ?? "";
    primaryColor = kit.primary_color;
    secondaryColor = kit.secondary_color ?? "#6c757d";
    accentColor = kit.accent_color ?? "#212529";
    headingFontFamily = kit.heading_font_family;
    bodyFontFamily = kit.body_font_family;
  }

  async function handleSave() {
    saving = true;
    error = null;
    successMessage = null;

    try {
      const res = await settings.saveBrandKit({
        name,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor || null,
        accent_color: accentColor || null,
        heading_font_family: headingFontFamily,
        heading_font_fallback: ["serif"],
        body_font_family: bodyFontFamily,
        body_font_fallback: ["sans-serif"],
      });

      _brandKit = res.brand_kit;
      successMessage = "Brand kit saved successfully!";
    } catch (e) {
      console.error("Failed to save brand kit:", e);
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown>;
        error = (body?.error as string) ?? "Failed to save brand kit.";
      } else {
        error = "Failed to save brand kit.";
      }
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    try {
      const res = await settings.getBrandKit();
      if (res.brand_kit) {
        _brandKit = res.brand_kit;
        populateForm(res.brand_kit);
      }
    } catch (e) {
      console.error("Failed to load brand kit:", e);
      error = "Failed to load brand kit.";
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Brand Kit - dough</title>
</svelte:head>

<div class="settings-subpage">
  <a href="/settings" class="back-link">&larr; Back to Settings</a>
  <h1>Brand Kit</h1>
  <p class="page-description">
    Customize the look and feel of your recipe cards and digital products.
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
      <p>Loading brand kit...</p>
    </div>
  {:else}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <!-- Brand Name -->
      <div class="card form-section">
        <h3>Brand Name</h3>
        <div class="form-group">
          <label for="brand-name">Name</label>
          <input type="text" id="brand-name" bind:value={name} placeholder="My Brand" required />
        </div>
      </div>

      <!-- Colors -->
      <div class="card form-section">
        <h3>Colors</h3>
        <p class="section-description">
          Choose the colors that represent your brand. These will be used in recipe cards, ebooks,
          and meal plans.
        </p>

        <div class="color-grid">
          <div class="form-group color-group">
            <label for="primary-color">Primary Color</label>
            <div class="color-input-wrapper">
              <input type="color" id="primary-color" bind:value={primaryColor} />
              <input
                type="text"
                class="color-text-input"
                bind:value={primaryColor}
                placeholder="#e85d04"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </div>

          <div class="form-group color-group">
            <label for="secondary-color">Secondary Color</label>
            <div class="color-input-wrapper">
              <input type="color" id="secondary-color" bind:value={secondaryColor} />
              <input
                type="text"
                class="color-text-input"
                bind:value={secondaryColor}
                placeholder="#6c757d"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </div>

          <div class="form-group color-group">
            <label for="accent-color">Accent Color</label>
            <div class="color-input-wrapper">
              <input type="color" id="accent-color" bind:value={accentColor} />
              <input
                type="text"
                class="color-text-input"
                bind:value={accentColor}
                placeholder="#212529"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </div>
        </div>

        <!-- Color Preview -->
        <div class="color-preview">
          <div class="preview-swatch" style="background-color: {primaryColor}">
            <span>Primary</span>
          </div>
          <div class="preview-swatch" style="background-color: {secondaryColor}">
            <span>Secondary</span>
          </div>
          <div class="preview-swatch" style="background-color: {accentColor}">
            <span>Accent</span>
          </div>
        </div>
      </div>

      <!-- Fonts -->
      <div class="card form-section">
        <h3>Typography</h3>
        <p class="section-description">Select font families for headings and body text.</p>

        <div class="font-grid">
          <div class="form-group">
            <label for="heading-font">Heading Font</label>
            <select id="heading-font" bind:value={headingFontFamily}>
              {#each FONT_OPTIONS as font (font)}
                <option value={font}>{font}</option>
              {/each}
            </select>
            <p
              class="font-preview"
              style="font-family: {headingFontFamily}, serif; font-size: 1.5rem; font-weight: 600;"
            >
              The Quick Brown Fox
            </p>
          </div>

          <div class="form-group">
            <label for="body-font">Body Font</label>
            <select id="body-font" bind:value={bodyFontFamily}>
              {#each FONT_OPTIONS as font (font)}
                <option value={font}>{font}</option>
              {/each}
            </select>
            <p class="font-preview" style="font-family: {bodyFontFamily}, sans-serif;">
              The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
            </p>
          </div>
        </div>
      </div>

      <!-- Logo -->
      <div class="card form-section">
        <h3>Logo</h3>
        <p class="section-description">
          Provide a URL to your brand logo. Logo file upload is coming soon.
        </p>

        <div class="form-group">
          <label for="logo-url">Logo URL</label>
          <input
            type="url"
            id="logo-url"
            bind:value={logoUrl}
            placeholder="https://example.com/logo.png"
          />
        </div>

        {#if logoUrl}
          <div class="logo-preview">
            <img src={logoUrl} alt="Brand logo preview" />
          </div>
        {/if}
      </div>

      <!-- Save Button -->
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save Brand Kit"}
        </button>
      </div>
    </form>
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

  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .color-group {
    margin-bottom: 0;
  }

  .color-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .color-input-wrapper input[type="color"] {
    width: 40px;
    height: 40px;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    flex-shrink: 0;
  }

  .color-text-input {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .color-preview {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .preview-swatch {
    flex: 1;
    height: 48px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--transition-fast);
  }

  .preview-swatch span {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .font-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .font-preview {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    color: var(--color-text);
    line-height: 1.5;
  }

  .logo-preview {
    margin-top: var(--space-3);
    padding: var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .logo-preview img {
    max-width: 200px;
    max-height: 100px;
    margin: 0 auto;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
  }

  .loading {
    text-align: center;
    padding: var(--space-16);
    color: var(--color-text-secondary);
  }

  @media (max-width: 768px) {
    .color-grid {
      grid-template-columns: 1fr;
    }

    .color-preview {
      flex-direction: column;
    }
  }
</style>
