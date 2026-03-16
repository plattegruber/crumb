<script lang="ts">
  import "../app.css";
  import type { LayoutData } from "./$types";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { setApiBaseUrl } from "$lib/api.js";
  import { getClerk, isSignedIn as checkSignedIn } from "$lib/clerk.js";
  import type Clerk from "@clerk/clerk-js";

  const { data, children }: { data: LayoutData; children: import("svelte").Snippet } = $props();

  let clerkLoaded = $state(false);
  let clerkSignedIn = $state(false);
  let mobileMenuOpen = $state(false);
  let clerk = $state<Clerk | null>(null);

  // Use derived to track server-side auth state (from cookie)
  const serverSignedIn = $derived(data.userId !== null);
  // Combine server-side and client-side auth state
  const signedIn = $derived(serverSignedIn || clerkSignedIn);

  // Determine the current path for active nav highlighting
  const currentPath = $derived($page.url.pathname);

  // All nav hrefs, used to find the best (longest) match
  const allNavHrefs = $derived(navSections.flatMap((s) => s.items.map((i) => i.href)));

  function isActive(href: string): boolean {
    if (href === "/") return currentPath === "/";
    const matches = currentPath === href || currentPath.startsWith(href + "/");
    if (!matches) return false;
    // Only highlight if no OTHER nav item is a longer match
    // e.g. on "/library/collections", "/library/collections" wins over "/library"
    return !allNavHrefs.some(
      (other) =>
        other !== href &&
        other.length > href.length &&
        (currentPath === other || currentPath.startsWith(other + "/")),
    );
  }

  onMount(async () => {
    // Configure API base URL
    // In local dev, Vite proxies /api → localhost:8787
    // In production, set VITE_API_BASE_URL to the Worker URL
    setApiBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "/api");

    // Initialize Clerk
    const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (publishableKey) {
      try {
        clerk = await getClerk(publishableKey);
        clerkLoaded = true;
        clerkSignedIn = checkSignedIn();
      } catch (e) {
        console.error("Failed to initialize Clerk:", e);
        clerkLoaded = true;
      }
    } else {
      // No Clerk key -- skip auth for development
      clerkLoaded = true;
    }
  });

  // Auth-only pages: if not signed in and we have Clerk loaded, show sign-in
  const isAuthPage = $derived(
    currentPath.startsWith("/sign-in") || currentPath.startsWith("/sign-up"),
  );
  const isPublicPage = $derived(currentPath === "/" || isAuthPage);
  const _showApp = $derived(signedIn || isPublicPage || !clerkLoaded);

  const navSections = [
    {
      label: "Library",
      items: [
        { href: "/library", label: "Recipes" },
        { href: "/library/collections", label: "Collections" },
        { href: "/library/import", label: "Import" },
      ],
    },
    {
      label: "Products",
      items: [{ href: "/products", label: "All Products" }],
    },
    {
      label: "Grow",
      items: [
        { href: "/grow", label: "Dashboard" },
        { href: "/grow/segments", label: "Segments" },
        { href: "/grow/analytics", label: "Analytics" },
        { href: "/grow/automation", label: "Automation" },
      ],
    },
    {
      label: "Settings",
      items: [
        { href: "/settings", label: "Account" },
        { href: "/settings/kit", label: "Kit Connection" },
        { href: "/settings/brand", label: "Brand Kit" },
        { href: "/settings/team", label: "Team" },
      ],
    },
  ];
</script>

<svelte:head>
  <title>dough</title>
</svelte:head>

{#if !clerkLoaded && !isPublicPage}
  <!-- Clerk still loading — show a minimal loading state instead of flashing content -->
  <div class="auth-gate">
    <div class="auth-gate-content">
      <h1>dough</h1>
      <p>Loading...</p>
    </div>
  </div>
{:else if !signedIn && !isPublicPage && clerkLoaded}
  <!-- Unauthenticated user on protected route — show sign-in prompt -->
  <div class="auth-gate">
    <div class="auth-gate-content">
      <h1>dough</h1>
      <p>Sign in to access your recipe dashboard.</p>
      <a href="/sign-in" class="btn btn-primary">Sign In</a>
    </div>
  </div>
{:else if signedIn && !isAuthPage}
  <!-- Authenticated app shell with sidebar -->
  <div class="app-shell" class:mobile-menu-open={mobileMenuOpen}>
    <!-- Mobile header -->
    <header class="mobile-header">
      <button
        class="btn-ghost menu-toggle"
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
        aria-label="Toggle navigation"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span class="mobile-logo">dough</span>
    </header>

    <!-- Sidebar overlay for mobile -->
    {#if mobileMenuOpen}
      <button
        class="sidebar-overlay"
        onclick={() => (mobileMenuOpen = false)}
        aria-label="Close navigation"
      ></button>
    {/if}

    <!-- Sidebar -->
    <nav class="sidebar" class:open={mobileMenuOpen}>
      <div class="sidebar-logo">
        <a href="/">dough</a>
      </div>

      <div class="sidebar-nav">
        {#each navSections as section (section.label)}
          <div class="nav-section">
            <span class="nav-section-label">{section.label}</span>
            {#each section.items as item (item.href)}
              <a
                href={item.href}
                class={["nav-item", { active: isActive(item.href) }]}
                onclick={() => (mobileMenuOpen = false)}
              >
                {item.label}
              </a>
            {/each}
          </div>
        {/each}
      </div>

      <div class="sidebar-footer">
        {#if clerk?.user}
          <div class="user-info">
            <span class="user-name">
              {clerk.user.firstName ?? clerk.user.emailAddresses[0]?.emailAddress ?? "User"}
            </span>
          </div>
        {/if}
      </div>
    </nav>

    <!-- Main content -->
    <main class="main-content">
      {@render children()}
    </main>
  </div>
{:else}
  <!-- Public pages / auth pages -->
  {@render children()}
{/if}

<style>
  /* Auth gate */
  .auth-gate {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-4);
  }

  .auth-gate-content {
    text-align: center;
  }

  .auth-gate-content h1 {
    font-size: var(--font-size-3xl);
    color: var(--color-primary);
    margin-bottom: var(--space-4);
  }

  .auth-gate-content p {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }

  /* App shell */
  .app-shell {
    display: flex;
    min-height: 100vh;
  }

  /* Mobile header */
  .mobile-header {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--header-height);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border-light);
    padding: 0 var(--space-4);
    align-items: center;
    gap: var(--space-3);
    z-index: 100;
  }

  .menu-toggle {
    padding: var(--space-2);
    border: none;
  }

  .mobile-logo {
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--color-primary);
  }

  /* Sidebar */
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border-light);
    display: flex;
    flex-direction: column;
    z-index: 200;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: var(--space-6) var(--space-6) var(--space-4);
  }

  .sidebar-logo a {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;
  }

  .sidebar-nav {
    flex: 1;
    padding: 0 var(--space-3);
  }

  .nav-section {
    margin-bottom: var(--space-6);
  }

  .nav-section-label {
    display: block;
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    padding: 0 var(--space-3);
    margin-bottom: var(--space-2);
  }

  .nav-item {
    display: block;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    transition: all var(--transition-fast);
    text-decoration: none;
  }

  .nav-item:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  .nav-item.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  .sidebar-footer {
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border-light);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .user-name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 150;
    border: none;
    cursor: default;
  }

  /* Main content */
  .main-content {
    flex: 1;
    margin-left: var(--sidebar-width);
    padding: var(--space-8);
    max-width: calc(var(--max-content-width) + var(--space-8) * 2);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .mobile-header {
      display: flex;
    }

    .sidebar {
      transform: translateX(-100%);
      transition: transform var(--transition-base);
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .sidebar-overlay {
      display: block;
    }

    .main-content {
      margin-left: 0;
      padding: var(--space-4);
      padding-top: calc(var(--header-height) + var(--space-4));
    }
  }
</style>
