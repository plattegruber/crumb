<svelte:head>
  <title>Dough — Recipe Intelligence for Food Creators</title>
  <meta
    name="description"
    content="Turn your recipes into revenue with Kit. Import from anywhere, send beautiful recipe cards, segment by diet, and sell digital products."
  />
</svelte:head>

<!-- Hero -->
<section class="hero">
  <div class="container">
    <div class="hero__content">
      <h1>Recipe intelligence for food creators</h1>
      <p class="hero__subtitle">
        Turn your recipes into revenue. Dough connects to your Kit account and adds the recipe layer
        that food creators need: import from anywhere, send beautiful recipe cards in emails,
        auto-segment subscribers by dietary preference, and turn your best recipes into digital
        products that sell.
      </p>
      <div class="hero__actions">
        <a href="#get-started" class="btn btn--primary btn--large">Get started free</a>
        <a href="/features" class="btn btn--secondary btn--large">See features</a>
      </div>
    </div>
    <div class="hero__visual">
      <div class="hero__card">
        <div class="hero__card-header">
          <span class="hero__card-badge">Recipe Card</span>
        </div>
        <div class="hero__card-body">
          <h3>Crispy Lemon Herb Chicken</h3>
          <div class="hero__card-meta">
            <span>35 min</span>
            <span>4 servings</span>
            <span>Gluten-free</span>
          </div>
          <div class="hero__card-ingredients">
            <div class="hero__ingredient"></div>
            <div class="hero__ingredient"></div>
            <div class="hero__ingredient"></div>
            <div class="hero__ingredient hero__ingredient--short"></div>
          </div>
          <div class="hero__card-cta">Save This Recipe</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Features Grid -->
<section class="section section--alt" id="features">
  <div class="container">
    <div class="section__header">
      <h2>Everything food creators need</h2>
      <p>
        Built specifically for food bloggers, recipe developers, and cooking influencers who use Kit
        to grow their audience.
      </p>
    </div>

    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-card__icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <h3>Import anything</h3>
        <p>
          Paste a URL, upload a screenshot, or share from Instagram, TikTok, or YouTube. Our AI
          extracts structured recipe data from any source and adds it to your library in seconds.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-card__icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <h3>Beautiful email cards</h3>
        <p>
          Recipe cards that render perfectly in every email client. Drop them into Kit broadcasts
          with a single click using our Kit editor plugin. No more linking out to your blog.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-card__icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <h3>Smart segmentation</h3>
        <p>
          Automatically tag subscribers with dietary preferences based on which recipes they save
          and engage with. Send targeted content to vegan, keto, gluten-free, and paleo segments.
        </p>
      </div>

      <div class="feature-card">
        <div class="feature-card__icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
        <h3>Digital products</h3>
        <p>
          Turn your recipe collections into beautiful ebooks, meal plans, and printable recipe card
          packs. Sell them through Kit Commerce or use them as lead magnets to grow your list.
        </p>
      </div>
    </div>
  </div>
</section>

<!-- Social Proof -->
<section class="section">
  <div class="container">
    <div class="section__header">
      <h2>Loved by food creators</h2>
      <p>Join the creators who are turning their recipes into a real business.</p>
    </div>

    <div class="testimonials">
      <div class="testimonial">
        <p class="testimonial__text">
          "Dough completely changed how I send recipe emails. My open rates went up 40% once I
          started using the recipe cards instead of linking to my blog."
        </p>
        <div class="testimonial__author">
          <div class="testimonial__avatar">S</div>
          <div>
            <div class="testimonial__name">Sarah Chen</div>
            <div class="testimonial__role">Food blogger, 45K subscribers</div>
          </div>
        </div>
      </div>

      <div class="testimonial">
        <p class="testimonial__text">
          "The dietary segmentation is magic. I used to send the same recipes to everyone. Now my
          vegan subscribers get vegan content and my engagement scores are through the roof."
        </p>
        <div class="testimonial__author">
          <div class="testimonial__avatar">M</div>
          <div>
            <div class="testimonial__name">Marcus Rivera</div>
            <div class="testimonial__role">Recipe developer, 28K subscribers</div>
          </div>
        </div>
      </div>

      <div class="testimonial">
        <p class="testimonial__text">
          "I turned my 50 best recipes into an ebook in under an hour. It's already my top-selling
          product on Kit. Dough pays for itself ten times over."
        </p>
        <div class="testimonial__author">
          <div class="testimonial__avatar">J</div>
          <div>
            <div class="testimonial__name">Jamie Okafor</div>
            <div class="testimonial__role">Cooking influencer, 92K subscribers</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="section cta-section">
  <div class="container">
    <div class="cta-block" id="get-started">
      <h2>Ready to turn your recipes into revenue?</h2>
      <p>
        Connect your Kit account and start building your recipe-powered email business today. Free
        to start, no credit card required.
      </p>
      <a href="#get-started" class="btn btn--primary btn--large">Get started free</a>
    </div>
  </div>
</section>

<style>
  /* Hero */
  .hero {
    padding: 6rem 0;
    background: linear-gradient(135deg, var(--color-brand-bg) 0%, #fff 60%);
  }

  .hero .container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    align-items: center;
  }

  .hero__content h1 {
    margin-bottom: 1.5rem;
  }

  .hero__subtitle {
    font-size: 1.25rem;
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: 2rem;
  }

  .hero__actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  /* Hero visual - mock recipe card */
  .hero__visual {
    display: flex;
    justify-content: center;
  }

  .hero__card {
    background: #fff;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    width: 100%;
    max-width: 360px;
    border: 1px solid var(--color-border);
  }

  .hero__card-header {
    background: linear-gradient(135deg, #f5d0a9, #f0b87a);
    padding: 3rem 1.5rem 1rem;
    position: relative;
  }

  .hero__card-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: var(--color-brand);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.625rem;
    border-radius: 100px;
  }

  .hero__card-body {
    padding: 1.5rem;
  }

  .hero__card-body h3 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
  }

  .hero__card-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 1.25rem;
  }

  .hero__card-ingredients {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .hero__ingredient {
    height: 8px;
    background: var(--color-bg-alt);
    border-radius: 4px;
  }

  .hero__ingredient--short {
    width: 60%;
  }

  .hero__card-cta {
    background: var(--color-brand);
    color: #fff;
    text-align: center;
    padding: 0.625rem;
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 0.9375rem;
  }

  /* Feature cards */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2rem;
  }

  .feature-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 2rem;
    transition:
      box-shadow 0.2s,
      transform 0.2s;
  }

  .feature-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .feature-card__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    background: var(--color-brand-bg);
    color: var(--color-brand);
    border-radius: var(--radius);
    margin-bottom: 1.25rem;
  }

  .feature-card h3 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
    font-family: var(--font-sans);
    font-weight: 600;
  }

  .feature-card p {
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  /* Testimonials */
  .testimonials {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }

  .testimonial {
    background: var(--color-bg-alt);
    border-radius: var(--radius-lg);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .testimonial__text {
    font-size: 1.0625rem;
    line-height: 1.7;
    color: var(--color-text);
    margin-bottom: 1.5rem;
    font-style: italic;
  }

  .testimonial__author {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .testimonial__avatar {
    width: 2.5rem;
    height: 2.5rem;
    background: var(--color-brand);
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
  }

  .testimonial__name {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .testimonial__role {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  /* CTA Section */
  .cta-section {
    background: var(--color-bg-alt);
  }

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
    .hero {
      padding: 3.5rem 0;
    }

    .hero .container {
      grid-template-columns: 1fr;
      gap: 3rem;
    }

    .hero__visual {
      order: -1;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }

    .testimonials {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .testimonials {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
