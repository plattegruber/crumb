<script lang="ts">
  import { onMount } from "svelte";

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" },
    );

    document.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Features — Dough</title>
  <meta
    name="description"
    content="Recipe library, Kit integration, dietary segmentation, digital products, analytics, and automation. Everything food creators need."
  />
</svelte:head>

<section class="page-hero">
  <div class="page-hero__grain"></div>
  <div class="container">
    <h1 class="page-hero__title">Built for food creators who use Kit</h1>
    <p class="page-hero__subtitle">
      Every feature is designed to help you turn recipes into subscriber engagement, digital
      products, and revenue — all through Kit.
    </p>
  </div>
</section>

<!-- Recipe Library -->
<section class="section feature-section">
  <div class="container">
    <div class="feature-row reveal">
      <div class="feature-row__text">
        <span class="feature-label">Recipe Library</span>
        <h2>Your recipes, organized and ready to use</h2>
        <p>
          Import recipes from any source and keep them in a structured, searchable library. Every
          recipe is stored with ingredients, instructions, timing, nutrition, and dietary tags —
          ready to drop into emails, ebooks, or meal plans at any time.
        </p>
        <ul class="feature-list">
          <li>Import from URL, screenshot, Instagram, TikTok, or YouTube</li>
          <li>AI-powered extraction fills in structured data automatically</li>
          <li>Full-text search across titles, ingredients, and tags</li>
          <li>Organize into collections for seasonal campaigns or product bundles</li>
          <li>Edit and refine recipes with a clean, focused editor</li>
          <li>Version history tracks every change</li>
        </ul>
      </div>
      <div class="feature-row__visual">
        <div class="mock-ui">
          <div class="mock-ui__header">
            <div class="mock-ui__dot"></div>
            <div class="mock-ui__dot"></div>
            <div class="mock-ui__dot"></div>
          </div>
          <div class="mock-ui__body">
            <div class="mock-search"></div>
            <div class="mock-grid">
              <div class="mock-recipe-card"></div>
              <div class="mock-recipe-card"></div>
              <div class="mock-recipe-card"></div>
              <div class="mock-recipe-card"></div>
              <div class="mock-recipe-card"></div>
              <div class="mock-recipe-card"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Kit Integration -->
<section class="section section--alt feature-section">
  <div class="container">
    <div class="feature-row feature-row--reversed reveal">
      <div class="feature-row__text">
        <span class="feature-label feature-label--sage">Kit Integration</span>
        <h2>Recipe cards that live inside Kit emails</h2>
        <p>
          Dough installs as a Kit editor plugin. Search your recipe library without leaving the Kit
          composer and insert beautiful recipe cards that render in every email client — no images
          to host, no broken layouts.
        </p>
        <ul class="feature-list">
          <li>Kit App Store editor plugin for the email composer</li>
          <li>Recipe cards with photo, ingredients, timing, and nutrition</li>
          <li>"Save This Recipe" CTA that drives subscribers back to your site</li>
          <li>One-click broadcast draft creation from any recipe</li>
          <li>Cards render as pure HTML tables — works everywhere</li>
          <li>Automatic subscriber tagging when recipes are saved</li>
        </ul>
      </div>
      <div class="feature-row__visual">
        <div class="mock-email">
          <div class="mock-email__from">From: you@newsletter.com</div>
          <div class="mock-email__subject">This Week's Recipe: Summer Panzanella</div>
          <div class="mock-email__body">
            <div class="mock-email__text-line"></div>
            <div class="mock-email__text-line mock-email__text-line--short"></div>
            <div class="mock-email__recipe-card">
              <div class="mock-email__recipe-photo"></div>
              <div class="mock-email__recipe-title">Summer Panzanella</div>
              <div class="mock-email__recipe-meta">25 min / 6 servings / Vegan</div>
              <div class="mock-email__recipe-btn">Save This Recipe</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Segmentation -->
<section class="section feature-section">
  <div class="container">
    <div class="feature-row reveal">
      <div class="feature-row__text">
        <span class="feature-label feature-label--terracotta">Segmentation</span>
        <h2>Know what your subscribers want to eat</h2>
        <p>
          Dough automatically tags subscribers with dietary preferences based on which recipes they
          save and engage with. Build segments around real behavior, not guesswork, and send content
          your subscribers actually want.
        </p>
        <ul class="feature-list">
          <li>Automatic dietary tagging: vegan, vegetarian, keto, paleo, gluten-free, and more</li>
          <li>Preference capture via "Save This Recipe" interactions</li>
          <li>Segment analytics show size, growth rate, and engagement per diet</li>
          <li>Tags sync directly to Kit subscriber profiles</li>
          <li>Build Kit automations that trigger on dietary preferences</li>
          <li>Preference-based product recommendations</li>
        </ul>
      </div>
      <div class="feature-row__visual">
        <div class="mock-segments">
          <div class="mock-segment">
            <div class="mock-segment__label">Vegan</div>
            <div class="mock-segment__bar">
              <div class="mock-segment__fill" style="width: 72%"></div>
            </div>
            <div class="mock-segment__count">3,240</div>
          </div>
          <div class="mock-segment">
            <div class="mock-segment__label">Gluten-free</div>
            <div class="mock-segment__bar">
              <div class="mock-segment__fill" style="width: 58%"></div>
            </div>
            <div class="mock-segment__count">2,610</div>
          </div>
          <div class="mock-segment">
            <div class="mock-segment__label">Keto</div>
            <div class="mock-segment__bar">
              <div class="mock-segment__fill" style="width: 45%"></div>
            </div>
            <div class="mock-segment__count">2,025</div>
          </div>
          <div class="mock-segment">
            <div class="mock-segment__label">Paleo</div>
            <div class="mock-segment__bar">
              <div class="mock-segment__fill" style="width: 31%"></div>
            </div>
            <div class="mock-segment__count">1,395</div>
          </div>
          <div class="mock-segment">
            <div class="mock-segment__label">Vegetarian</div>
            <div class="mock-segment__bar">
              <div class="mock-segment__fill" style="width: 65%"></div>
            </div>
            <div class="mock-segment__count">2,925</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Digital Products -->
<section class="section section--alt feature-section">
  <div class="container">
    <div class="feature-row feature-row--reversed reveal">
      <div class="feature-row__text">
        <span class="feature-label">Digital Products</span>
        <h2>Turn your recipes into products that sell</h2>
        <p>
          Select recipes from your library and generate professional digital products in minutes.
          Sell through Kit Commerce or use them as lead magnets to grow your email list.
        </p>
        <ul class="feature-list">
          <li>Recipe ebooks with custom covers, intros, and layout options</li>
          <li>Meal plans with shopping lists and prep schedules</li>
          <li>Printable recipe card packs (PDF, letter or A4)</li>
          <li>Lead magnets that gate content behind email signup</li>
          <li>Automatic Kit product creation and delivery</li>
          <li>Revenue attribution shows which recipes drive sales</li>
        </ul>
      </div>
      <div class="feature-row__visual">
        <div class="mock-products">
          <div class="mock-product">
            <div class="mock-product__cover mock-product__cover--ebook"></div>
            <div class="mock-product__title">Ebook</div>
          </div>
          <div class="mock-product">
            <div class="mock-product__cover mock-product__cover--meal"></div>
            <div class="mock-product__title">Meal Plan</div>
          </div>
          <div class="mock-product">
            <div class="mock-product__cover mock-product__cover--cards"></div>
            <div class="mock-product__title">Card Pack</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Analytics -->
<section class="section feature-section">
  <div class="container">
    <div class="feature-row reveal">
      <div class="feature-row__text">
        <span class="feature-label feature-label--sage">Analytics</span>
        <h2>See which recipes drive your business</h2>
        <p>
          Dough tracks engagement across every touchpoint — email opens, recipe saves, product
          purchases — and rolls it up into a single engagement score for each recipe and subscriber.
        </p>
        <ul class="feature-list">
          <li>Per-recipe engagement scores based on saves, clicks, and purchases</li>
          <li>Revenue attribution ties sales back to specific recipe content</li>
          <li>Subscriber-level engagement profiles</li>
          <li>Product recommendations based on engagement patterns</li>
          <li>Seasonal trend analysis across your recipe catalog</li>
          <li>Export data for deeper analysis</li>
        </ul>
      </div>
      <div class="feature-row__visual">
        <div class="mock-analytics">
          <div class="mock-stat">
            <div class="mock-stat__value">4,821</div>
            <div class="mock-stat__label">Recipe saves this month</div>
          </div>
          <div class="mock-stat">
            <div class="mock-stat__value">$2,340</div>
            <div class="mock-stat__label">Product revenue</div>
          </div>
          <div class="mock-stat">
            <div class="mock-stat__value">67%</div>
            <div class="mock-stat__label">Avg. engagement rate</div>
          </div>
          <div class="mock-chart">
            <div class="mock-chart__bar" style="height: 40%"></div>
            <div class="mock-chart__bar" style="height: 55%"></div>
            <div class="mock-chart__bar" style="height: 65%"></div>
            <div class="mock-chart__bar" style="height: 50%"></div>
            <div class="mock-chart__bar" style="height: 80%"></div>
            <div class="mock-chart__bar" style="height: 70%"></div>
            <div class="mock-chart__bar" style="height: 90%"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Automation -->
<section class="section section--alt feature-section">
  <div class="container">
    <div class="feature-row feature-row--reversed reveal">
      <div class="feature-row__text">
        <span class="feature-label feature-label--terracotta">Automation</span>
        <h2>Set it up once, let it run</h2>
        <p>
          Build automated workflows that trigger based on recipe engagement. When a subscriber saves
          a recipe, Dough can start a Kit sequence, apply tags, recommend products, or schedule
          seasonal recipe drops.
        </p>
        <ul class="feature-list">
          <li>Save-recipe trigger starts Kit automations</li>
          <li>Seasonal recipe drops on a schedule you set</li>
          <li>Post-save sequences deliver related recipes over time</li>
          <li>Automatic product recommendations based on saved recipes</li>
          <li>Win-back sequences for disengaged subscribers</li>
          <li>All automations run through Kit — no separate email system</li>
        </ul>
      </div>
      <div class="feature-row__visual">
        <div class="mock-automation">
          <div class="mock-auto-step">
            <div class="mock-auto-step__icon">1</div>
            <div class="mock-auto-step__text">Subscriber saves recipe</div>
          </div>
          <div class="mock-auto-connector"></div>
          <div class="mock-auto-step">
            <div class="mock-auto-step__icon">2</div>
            <div class="mock-auto-step__text">Tag with dietary preference</div>
          </div>
          <div class="mock-auto-connector"></div>
          <div class="mock-auto-step">
            <div class="mock-auto-step__icon">3</div>
            <div class="mock-auto-step__text">Start recipe sequence</div>
          </div>
          <div class="mock-auto-connector"></div>
          <div class="mock-auto-step">
            <div class="mock-auto-step__icon">4</div>
            <div class="mock-auto-step__text">Recommend matching product</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="section cta-section">
  <div class="container">
    <div class="cta-block reveal">
      <h2>Ready to get started?</h2>
      <p>
        Connect your Kit account and start building your recipe-powered email business. Free to
        start, no credit card required.
      </p>
      <a href="https://dash.makedough.app/sign-up" class="btn btn--primary btn--large"
        >Get started free</a
      >
    </div>
  </div>
</section>

<style>
  /* Page Hero */
  .page-hero {
    padding: 6rem 0 4rem;
    text-align: center;
    background: linear-gradient(
      165deg,
      var(--color-cream) 0%,
      var(--color-parchment) 40%,
      #f8e8d6 70%,
      var(--color-cream) 100%
    );
    position: relative;
    overflow: hidden;
  }

  .page-hero__grain {
    position: absolute;
    inset: -50%;
    width: 200%;
    height: 200%;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    animation: grain 8s steps(10) infinite;
    pointer-events: none;
    opacity: 0.5;
  }

  .page-hero__title {
    margin-bottom: 1.25rem;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
    position: relative;
    animation: fadeInUp 0.8s var(--ease-out) both;
  }

  .page-hero__subtitle {
    font-size: 1.25rem;
    color: var(--color-text-secondary);
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.75;
    position: relative;
    animation: fadeInUp 0.8s var(--ease-out) 0.15s both;
  }

  /* Feature rows */
  .feature-section {
    padding: 5rem 0;
  }

  .feature-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4.5rem;
    align-items: center;
  }

  .feature-row--reversed {
    direction: rtl;
  }

  .feature-row--reversed > * {
    direction: ltr;
  }

  .feature-label {
    display: inline-block;
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-saffron);
    background: var(--color-saffron-bg);
    padding: 0.3rem 0.875rem;
    border-radius: 100px;
    margin-bottom: 1.25rem;
  }

  .feature-label--sage {
    color: var(--color-sage);
    background: var(--color-sage-bg);
  }

  .feature-label--terracotta {
    color: var(--color-terracotta);
    background: rgba(199, 91, 57, 0.1);
  }

  .feature-row__text h2 {
    margin-bottom: 1rem;
  }

  .feature-row__text p {
    font-size: 1.0625rem;
    color: var(--color-text-secondary);
    line-height: 1.75;
    margin-bottom: 1.75rem;
  }

  .feature-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .feature-list li {
    position: relative;
    padding-left: 1.625rem;
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
    line-height: 1.55;
  }

  .feature-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.55em;
    width: 8px;
    height: 8px;
    background: var(--color-sage);
    border-radius: 50%;
  }

  /* Mock UIs */
  .feature-row__visual {
    display: flex;
    justify-content: center;
  }

  .mock-ui {
    background: #fff;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    width: 100%;
    border: 1px solid var(--color-border);
  }

  .mock-ui__header {
    display: flex;
    gap: 6px;
    padding: 0.875rem 1.125rem;
    background: var(--color-cream-warm);
    border-bottom: 1px solid var(--color-border);
  }

  .mock-ui__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-border);
  }

  .mock-ui__body {
    padding: 1.25rem;
  }

  .mock-search {
    height: 2.25rem;
    background: var(--color-cream-warm);
    border-radius: var(--radius);
    margin-bottom: 1rem;
    border: 1px solid var(--color-border);
  }

  .mock-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .mock-recipe-card {
    aspect-ratio: 3 / 4;
    background: linear-gradient(145deg, #f0c89a, #e8a96f);
    border-radius: var(--radius);
  }

  /* Mock email */
  .mock-email {
    background: #fff;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    width: 100%;
    border: 1px solid var(--color-border);
  }

  .mock-email__from,
  .mock-email__subject {
    padding: 0.625rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .mock-email__subject {
    font-weight: 600;
    color: var(--color-text);
  }

  .mock-email__body {
    padding: 1.25rem;
  }

  .mock-email__text-line {
    height: 8px;
    background: var(--color-parchment);
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .mock-email__text-line--short {
    width: 70%;
    margin-bottom: 1.25rem;
  }

  .mock-email__recipe-card {
    border: 2px solid var(--color-terracotta);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .mock-email__recipe-photo {
    height: 100px;
    background: linear-gradient(145deg, #f0c89a, #e8a96f);
  }

  .mock-email__recipe-title {
    font-weight: 700;
    font-family: var(--font-display);
    padding: 0.75rem 1rem 0.25rem;
  }

  .mock-email__recipe-meta {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    padding: 0 1rem 0.75rem;
  }

  .mock-email__recipe-btn {
    background: var(--color-terracotta);
    color: #fff;
    text-align: center;
    padding: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 700;
  }

  /* Mock segments */
  .mock-segments {
    background: #fff;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.125rem;
    border: 1px solid var(--color-border);
  }

  .mock-segment {
    display: grid;
    grid-template-columns: 100px 1fr 60px;
    gap: 0.875rem;
    align-items: center;
  }

  .mock-segment__label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .mock-segment__bar {
    height: 10px;
    background: var(--color-parchment);
    border-radius: 5px;
    overflow: hidden;
  }

  .mock-segment__fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-sage), var(--color-sage-light));
    border-radius: 5px;
  }

  .mock-segment__count {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-align: right;
    font-weight: 500;
  }

  /* Mock products */
  .mock-products {
    display: flex;
    gap: 1.75rem;
    justify-content: center;
  }

  .mock-product {
    text-align: center;
  }

  .mock-product__cover {
    width: 130px;
    height: 170px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    margin-bottom: 0.875rem;
    transition: transform 0.3s var(--ease-out);
  }

  .mock-product:hover .mock-product__cover {
    transform: translateY(-4px) rotate(-1deg);
  }

  .mock-product__cover--ebook {
    background: linear-gradient(145deg, var(--color-terracotta), var(--color-terracotta-dark));
  }

  .mock-product__cover--meal {
    background: linear-gradient(145deg, var(--color-sage), #5d7150);
  }

  .mock-product__cover--cards {
    background: linear-gradient(145deg, var(--color-saffron), var(--color-saffron-dark));
  }

  .mock-product__title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  /* Mock analytics */
  .mock-analytics {
    background: #fff;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    padding: 2rem;
    border: 1px solid var(--color-border);
  }

  .mock-stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .mock-stat:last-of-type {
    border-bottom: none;
  }

  .mock-stat__value {
    font-size: 1.625rem;
    font-weight: 800;
    color: var(--color-saffron);
    font-family: var(--font-display);
  }

  .mock-stat__label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .mock-chart {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    height: 80px;
    margin-top: 1.25rem;
    padding-top: 0.5rem;
  }

  .mock-chart__bar {
    flex: 1;
    background: linear-gradient(to top, var(--color-saffron), var(--color-saffron-light));
    border-radius: 4px 4px 0 0;
    opacity: 0.75;
    transition: opacity 0.3s;
  }

  .mock-chart__bar:hover {
    opacity: 1;
  }

  /* Mock automation */
  .mock-automation {
    background: #fff;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    padding: 2.25rem 1.75rem;
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }

  .mock-auto-step {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    width: 100%;
    padding: 0.875rem 1.125rem;
    background: var(--color-cream-warm);
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
    transition:
      transform 0.2s var(--ease-out),
      box-shadow 0.2s var(--ease-out);
  }

  .mock-auto-step:hover {
    transform: translateX(4px);
    box-shadow: var(--shadow-sm);
  }

  .mock-auto-step__icon {
    width: 1.875rem;
    height: 1.875rem;
    background: var(--color-terracotta);
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .mock-auto-step__text {
    font-size: 0.9rem;
    font-weight: 500;
  }

  .mock-auto-connector {
    width: 2px;
    height: 1.25rem;
    background: var(--color-border);
  }

  /* CTA */
  .cta-section {
    background: var(--color-bg-dark);
    position: relative;
    overflow: hidden;
  }

  .cta-section::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(212, 134, 11, 0.12) 0%, transparent 70%);
    pointer-events: none;
  }

  .cta-block {
    text-align: center;
    max-width: 640px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  .cta-block h2 {
    color: var(--color-cream);
    margin-bottom: 1.25rem;
  }

  .cta-block p {
    font-size: 1.15rem;
    color: #9a8a7e;
    margin-bottom: 2.5rem;
    line-height: 1.7;
  }

  @media (max-width: 768px) {
    .page-hero {
      padding: 3.5rem 0 2.5rem;
    }

    .feature-row {
      grid-template-columns: 1fr;
      gap: 2.5rem;
    }

    .feature-row--reversed {
      direction: ltr;
    }

    .mock-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .mock-segment {
      grid-template-columns: 80px 1fr 50px;
    }

    .mock-products {
      flex-wrap: wrap;
    }
  }
</style>
