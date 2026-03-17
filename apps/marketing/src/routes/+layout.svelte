<script lang="ts">
  import "../app.css";

  const { children } = $props();

  let mobileMenuOpen = $state(false);

  function toggleMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMenu() {
    mobileMenuOpen = false;
  }
</script>

<svelte:head>
  <title>Dough — Recipe Intelligence for Food Creators</title>
  <meta
    name="description"
    content="Turn your recipes into revenue. Dough connects to Kit and adds recipe intelligence: import, segment, automate, and sell."
  />
</svelte:head>

<header class="nav">
  <div class="nav__inner container">
    <a href="/" class="nav__logo" onclick={closeMenu}>
      <span class="nav__logo-icon">D</span>
      <span class="nav__logo-text">Dough</span>
    </a>

    <button
      class="nav__toggle"
      onclick={toggleMenu}
      aria-label="Toggle navigation menu"
      aria-expanded={mobileMenuOpen}
    >
      <span class="nav__toggle-bar" class:open={mobileMenuOpen}></span>
      <span class="nav__toggle-bar" class:open={mobileMenuOpen}></span>
      <span class="nav__toggle-bar" class:open={mobileMenuOpen}></span>
    </button>

    <nav class="nav__links" class:nav__links--open={mobileMenuOpen}>
      <a href="/features" class="nav__link" onclick={closeMenu}>Features</a>
      <a href="/blog" class="nav__link" onclick={closeMenu}>Blog</a>
      <a
        href="https://dash.makedough.app/sign-up"
        class="btn btn--primary nav__cta"
        onclick={closeMenu}>Get Started</a
      >
    </nav>
  </div>
</header>

<main>
  {@render children()}
</main>

<footer class="footer">
  <div class="footer__inner container">
    <div class="footer__brand">
      <a href="/" class="nav__logo">
        <span class="nav__logo-icon">D</span>
        <span class="nav__logo-text">Dough</span>
      </a>
      <p class="footer__tagline">Recipe intelligence for food creators.</p>
    </div>

    <div class="footer__links">
      <div class="footer__col">
        <h4 class="footer__heading">Product</h4>
        <a href="/features">Features</a>
        <a href="/blog">Blog</a>
      </div>
      <div class="footer__col">
        <h4 class="footer__heading">Resources</h4>
        <a href="/blog/welcome-to-dough">About</a>
        <a href="/blog/recipe-email-cards">Email Cards</a>
      </div>
      <div class="footer__col">
        <h4 class="footer__heading">Legal</h4>
        <a href="/#privacy">Privacy</a>
        <a href="/#terms">Terms</a>
      </div>
    </div>

    <div class="footer__bottom">
      <p>&copy; {new Date().getFullYear()} Dough. All rights reserved.</p>
    </div>
  </div>
</footer>

<style>
  /* Navigation */
  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--color-border);
  }

  .nav__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 4rem;
  }

  .nav__logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--color-text);
    text-decoration: none;
  }

  .nav__logo:hover {
    color: var(--color-text);
  }

  .nav__logo-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--color-brand);
    color: #fff;
    border-radius: 6px;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.125rem;
  }

  .nav__logo-text {
    font-family: var(--font-display);
  }

  .nav__links {
    display: flex;
    align-items: center;
    gap: 2rem;
  }

  .nav__link {
    color: var(--color-text-secondary);
    font-weight: 500;
    font-size: 0.9375rem;
    text-decoration: none;
    transition: color 0.2s;
  }

  .nav__link:hover {
    color: var(--color-brand);
  }

  .nav__cta {
    padding: 0.5rem 1.25rem;
    font-size: 0.875rem;
  }

  .nav__toggle {
    display: none;
    flex-direction: column;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
  }

  .nav__toggle-bar {
    display: block;
    width: 24px;
    height: 2px;
    background: var(--color-text);
    border-radius: 2px;
    transition: all 0.3s;
  }

  .nav__toggle-bar.open:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }

  .nav__toggle-bar.open:nth-child(2) {
    opacity: 0;
  }

  .nav__toggle-bar.open:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }

  @media (max-width: 768px) {
    .nav__toggle {
      display: flex;
    }

    .nav__links {
      display: none;
      position: absolute;
      top: 4rem;
      left: 0;
      right: 0;
      flex-direction: column;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      padding: 1.5rem;
      gap: 1rem;
      box-shadow: var(--shadow-md);
    }

    .nav__links--open {
      display: flex;
    }
  }

  /* Footer */
  .footer {
    background: var(--color-bg-dark);
    color: #ccc;
    padding: 4rem 0 2rem;
  }

  .footer__inner {
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .footer__brand {
    max-width: 300px;
  }

  .footer__brand .nav__logo {
    color: #fff;
    margin-bottom: 0.75rem;
  }

  .footer__brand .nav__logo-icon {
    background: var(--color-brand);
  }

  .footer__tagline {
    color: #999;
    font-size: 0.9375rem;
    margin: 0;
  }

  .footer__links {
    display: flex;
    gap: 4rem;
    flex-wrap: wrap;
  }

  .footer__col {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .footer__heading {
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
    font-family: var(--font-sans);
  }

  .footer__col a {
    color: #999;
    font-size: 0.9375rem;
    text-decoration: none;
    transition: color 0.2s;
  }

  .footer__col a:hover {
    color: var(--color-brand-light);
  }

  .footer__bottom {
    border-top: 1px solid #333;
    padding-top: 1.5rem;
  }

  .footer__bottom p {
    font-size: 0.875rem;
    color: #666;
    margin: 0;
  }

  @media (max-width: 768px) {
    .footer__links {
      gap: 2rem;
    }
  }
</style>
