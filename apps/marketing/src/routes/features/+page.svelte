<svelte:head>
  <title>Features — Dough</title>
  <meta
    name="description"
    content="Recipe library, Kit integration, dietary segmentation, digital products, analytics, and automation. Everything food creators need."
  />
</svelte:head>

<section class="page-hero">
  <div class="container">
    <h1>Built for food creators who use Kit</h1>
    <p class="page-hero__subtitle">
      Every feature is designed to help you turn recipes into subscriber engagement, digital
      products, and revenue — all through Kit.
    </p>
  </div>
</section>

<!-- Recipe Library -->
<section class="section feature-section">
  <div class="container">
    <div class="feature-row">
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
    <div class="feature-row feature-row--reversed">
      <div class="feature-row__text">
        <span class="feature-label">Kit Integration</span>
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
    <div class="feature-row">
      <div class="feature-row__text">
        <span class="feature-label">Segmentation</span>
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
    <div class="feature-row feature-row--reversed">
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
    <div class="feature-row">
      <div class="feature-row__text">
        <span class="feature-label">Analytics</span>
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
    <div class="feature-row feature-row--reversed">
      <div class="feature-row__text">
        <span class="feature-label">Automation</span>
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
<section class="section">
  <div class="container">
    <div class="cta-block">
      <h2>Ready to get started?</h2>
      <p>
        Connect your Kit account and start building your recipe-powered email business. Free to
        start, no credit card required.
      </p>
      <a href="https://dash.makedough.app/sign-up" class="btn btn--primary btn--large">Get started free</a>
    </div>
  </div>
</section>

<style>
  /* Page Hero */
  .page-hero {
    padding: 5rem 0 3rem;
    text-align: center;
    background: linear-gradient(135deg, var(--color-brand-bg) 0%, #fff 60%);
  }

  .page-hero h1 {
    margin-bottom: 1rem;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
  }

  .page-hero__subtitle {
    font-size: 1.25rem;
    color: var(--color-text-secondary);
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.7;
  }

  /* Feature rows */
  .feature-section {
    padding: 5rem 0;
  }

  .feature-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
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
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-brand);
    background: var(--color-brand-bg);
    padding: 0.25rem 0.75rem;
    border-radius: 100px;
    margin-bottom: 1rem;
  }

  .feature-row__text h2 {
    margin-bottom: 1rem;
  }

  .feature-row__text p {
    font-size: 1.0625rem;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: 1.5rem;
  }

  .feature-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .feature-list li {
    position: relative;
    padding-left: 1.5rem;
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
    line-height: 1.5;
  }

  .feature-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.5em;
    width: 8px;
    height: 8px;
    background: var(--color-brand);
    border-radius: 50%;
  }

  /* Mock UIs */
  .feature-row__visual {
    display: flex;
    justify-content: center;
  }

  .mock-ui {
    background: #fff;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    width: 100%;
    border: 1px solid var(--color-border);
  }

  .mock-ui__header {
    display: flex;
    gap: 6px;
    padding: 0.75rem 1rem;
    background: var(--color-bg-alt);
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
    height: 2rem;
    background: var(--color-bg-alt);
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
    background: linear-gradient(135deg, #f5d0a9, #f0b87a);
    border-radius: var(--radius);
  }

  /* Mock email */
  .mock-email {
    background: #fff;
    border-radius: var(--radius-lg);
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
    background: var(--color-bg-alt);
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .mock-email__text-line--short {
    width: 70%;
    margin-bottom: 1.25rem;
  }

  .mock-email__recipe-card {
    border: 2px solid var(--color-brand);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .mock-email__recipe-photo {
    height: 100px;
    background: linear-gradient(135deg, #f5d0a9, #f0b87a);
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
    background: var(--color-brand);
    color: #fff;
    text-align: center;
    padding: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  /* Mock segments */
  .mock-segments {
    background: #fff;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border: 1px solid var(--color-border);
  }

  .mock-segment {
    display: grid;
    grid-template-columns: 100px 1fr 60px;
    gap: 0.75rem;
    align-items: center;
  }

  .mock-segment__label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .mock-segment__bar {
    height: 8px;
    background: var(--color-bg-alt);
    border-radius: 4px;
    overflow: hidden;
  }

  .mock-segment__fill {
    height: 100%;
    background: var(--color-brand);
    border-radius: 4px;
  }

  .mock-segment__count {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-align: right;
  }

  /* Mock products */
  .mock-products {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
  }

  .mock-product {
    text-align: center;
  }

  .mock-product__cover {
    width: 120px;
    height: 160px;
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    margin-bottom: 0.75rem;
  }

  .mock-product__cover--ebook {
    background: linear-gradient(135deg, #e67e22, #d35400);
  }

  .mock-product__cover--meal {
    background: linear-gradient(135deg, #27ae60, #1e8449);
  }

  .mock-product__cover--cards {
    background: linear-gradient(135deg, #3498db, #2471a3);
  }

  .mock-product__title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  /* Mock analytics */
  .mock-analytics {
    background: #fff;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 1.5rem;
    border: 1px solid var(--color-border);
  }

  .mock-stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .mock-stat:last-of-type {
    border-bottom: none;
  }

  .mock-stat__value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-brand);
    font-family: var(--font-display);
  }

  .mock-stat__label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .mock-chart {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    height: 80px;
    margin-top: 1rem;
    padding-top: 0.5rem;
  }

  .mock-chart__bar {
    flex: 1;
    background: var(--color-brand);
    border-radius: 4px 4px 0 0;
    opacity: 0.7;
  }

  /* Mock automation */
  .mock-automation {
    background: #fff;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 2rem 1.5rem;
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }

  .mock-auto-step {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: var(--color-bg-alt);
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
  }

  .mock-auto-step__icon {
    width: 1.75rem;
    height: 1.75rem;
    background: var(--color-brand);
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
    font-size: 0.875rem;
    font-weight: 500;
  }

  .mock-auto-connector {
    width: 2px;
    height: 1.25rem;
    background: var(--color-border);
  }

  /* CTA block */
  .cta-block {
    text-align: center;
    max-width: 640px;
    margin: 0 auto;
  }

  .cta-block h2 {
    margin-bottom: 1rem;
  }

  .cta-block p {
    font-size: 1.125rem;
    color: var(--color-text-secondary);
    margin-bottom: 2rem;
  }

  @media (max-width: 768px) {
    .page-hero {
      padding: 3rem 0 2rem;
    }

    .feature-row {
      grid-template-columns: 1fr;
      gap: 2rem;
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
