<script lang="ts">
  import "../app.css";

  const { children } = $props();

  let mobileMenuOpen = $state(false);
  let scrolled = $state(false);

  function toggleMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMenu() {
    mobileMenuOpen = false;
  }

  function handleScroll() {
    scrolled = window.scrollY > 20;
  }
</script>

<svelte:window onscroll={handleScroll} />

<svelte:head>
  <title>Dough — Recipe Intelligence for Food Creators</title>
  <meta
    name="description"
    content="Turn your recipes into revenue. Dough connects to Kit and adds recipe intelligence: import, segment, automate, and sell."
  />
</svelte:head>

<header class="nav" class:nav--scrolled={scrolled}>
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
    <div class="footer__top">
      <div class="footer__brand">
        <a href="/" class="nav__logo footer__logo-link">
          <span class="nav__logo-icon">D</span>
          <span class="nav__logo-text">Dough</span>
        </a>
        <p class="footer__tagline">
          Recipe intelligence for food creators who use Kit. Import, segment, automate, and sell.
        </p>
      </div>

      <div class="footer__columns">
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
    </div>

    <div class="footer__bottom">
      <p>&copy; {new Date().getFullYear()} Dough. All rights reserved.</p>
    </div>
  </div>
</footer>

<style>
  /* ---- Navigation ---- */
  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(253, 250, 245, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid transparent;
    transition:
      background 0.3s var(--ease-out),
      border-color 0.3s var(--ease-out),
      box-shadow 0.3s var(--ease-out);
  }

  .nav--scrolled {
    background: rgba(253, 250, 245, 0.96);
    border-bottom-color: var(--color-border);
    box-shadow: 0 1px 8px rgba(44, 24, 16, 0.04);
  }

  .nav__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 4.25rem;
  }

  .nav__logo {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-weight: 800;
    font-size: 1.35rem;
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
    width: 2.125rem;
    height: 2.125rem;
    background: var(--color-terracotta);
    color: #fff;
    border-radius: 8px;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.2rem;
  }

  .nav__logo-text {
    font-family: var(--font-display);
  }

  .nav__links {
    display: flex;
    align-items: center;
    gap: 2.25rem;
  }

  .nav__link {
    color: var(--color-text-secondary);
    font-weight: 500;
    font-size: 0.9375rem;
    text-decoration: none;
    transition: color 0.2s;
    position: relative;
  }

  .nav__link::after {
    content: "";
    position: absolute;
    bottom: -4px;
    left: 0;
    width: 0;
    height: 2px;
    background: var(--color-terracotta);
    border-radius: 1px;
    transition: width 0.25s var(--ease-out);
  }

  .nav__link:hover {
    color: var(--color-text);
  }

  .nav__link:hover::after {
    width: 100%;
  }

  .nav__cta {
    padding: 0.5rem 1.35rem;
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
      top: 4.25rem;
      left: 0;
      right: 0;
      flex-direction: column;
      background: var(--color-cream);
      border-bottom: 1px solid var(--color-border);
      padding: 1.5rem;
      gap: 1rem;
      box-shadow: var(--shadow-md);
    }

    .nav__links--open {
      display: flex;
    }
  }

  /* ---- Footer ---- */
  .footer {
    background: var(--color-bg-dark);
    color: #c4b5a8;
    padding: 5rem 0 2.5rem;
  }

  .footer__inner {
    display: flex;
    flex-direction: column;
    gap: 3.5rem;
  }

  .footer__top {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 4rem;
  }

  .footer__brand {
    max-width: 320px;
  }

  .footer__logo-link {
    margin-bottom: 1rem;
    display: inline-flex;
  }

  .footer__brand .nav__logo {
    color: #fff;
    margin-bottom: 1rem;
  }

  .footer__brand .nav__logo-icon {
    background: var(--color-terracotta);
  }

  .footer__tagline {
    color: #8a7b6f;
    font-size: 0.9375rem;
    margin: 0;
    line-height: 1.65;
  }

  .footer__columns {
    display: flex;
    gap: 5rem;
    flex-wrap: wrap;
  }

  .footer__col {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .footer__heading {
    color: var(--color-parchment);
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.4rem;
    font-family: var(--font-body);
  }

  .footer__col a {
    color: #8a7b6f;
    font-size: 0.9375rem;
    text-decoration: none;
    transition: color 0.2s;
  }

  .footer__col a:hover {
    color: var(--color-saffron-light);
  }

  .footer__bottom {
    border-top: 1px solid #352a25;
    padding-top: 2rem;
  }

  .footer__bottom p {
    font-size: 0.8125rem;
    color: #5a4d44;
    margin: 0;
  }

  @media (max-width: 768px) {
    .footer__top {
      grid-template-columns: 1fr;
      gap: 2.5rem;
    }

    .footer__columns {
      gap: 2.5rem;
    }
  }
</style>
