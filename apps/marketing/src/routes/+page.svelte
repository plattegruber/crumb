<script lang="ts">
  import { onMount } from "svelte";

  const { data } = $props();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    document.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>Dough — Recipe Intelligence for Food Creators</title>
  <meta
    name="description"
    content="Turn your recipes into revenue with Kit. Import from anywhere, send beautiful recipe cards, segment by diet, and sell digital products."
  />
</svelte:head>

<!-- Hero -->
<section class="hero">
  <div class="hero__grain"></div>
  <div class="container">
    <div class="hero__layout">
      <div class="hero__content">
        <h1 class="hero__title">
          <span class="hero__title-line">Recipe intelligence</span>
          <span class="hero__title-line hero__title-line--delay">for food creators</span>
        </h1>
        <p class="hero__subtitle">
          Turn your recipes into revenue. Dough connects to your Kit account and adds the recipe
          layer food creators need: import from anywhere, send beautiful recipe cards in emails,
          auto-segment subscribers by dietary preference, and turn your best recipes into digital
          products that sell.
        </p>
        <div class="hero__actions">
          <a href="https://dash.makedough.app/sign-up" class="btn btn--primary btn--large"
            >Get started free</a
          >
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
  </div>
</section>

<!-- Wave divider -->
<div class="wave-divider">
  <svg viewBox="0 0 1440 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M0,40 C360,80 720,0 1080,40 C1260,60 1380,30 1440,35 L1440,60 L0,60 Z"
      fill="var(--color-bg-alt)"
    />
  </svg>
</div>

<!-- Features Grid -->
<section class="section section--alt" id="features">
  <div class="container">
    <div class="section__header reveal">
      <h2>Everything food creators need</h2>
      <p>
        Built specifically for food bloggers, recipe developers, and cooking influencers who use Kit
        to grow their audience.
      </p>
    </div>

    <div class="features-grid reveal-stagger">
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
        <div class="feature-card__icon feature-card__icon--sage">
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
        <div class="feature-card__icon feature-card__icon--terracotta">
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
        <div class="feature-card__icon feature-card__icon--saffron">
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
    <div class="section__header reveal">
      <h2>Loved by food creators</h2>
      <p>Join the creators who are turning their recipes into a real business.</p>
    </div>

    <div class="testimonials reveal-stagger">
      <div class="testimonial">
        <div class="testimonial__quote">&ldquo;</div>
        <p class="testimonial__text">
          Dough completely changed how I send recipe emails. My open rates went up 40% once I
          started using the recipe cards instead of linking to my blog.
        </p>
        <div class="testimonial__author">
          <div class="testimonial__avatar">SC</div>
          <div>
            <div class="testimonial__name">Sarah Chen</div>
            <div class="testimonial__role">Food blogger, 45K subscribers</div>
          </div>
        </div>
      </div>

      <div class="testimonial">
        <div class="testimonial__quote">&ldquo;</div>
        <p class="testimonial__text">
          The dietary segmentation is magic. I used to send the same recipes to everyone. Now my
          vegan subscribers get vegan content and my engagement scores are through the roof.
        </p>
        <div class="testimonial__author">
          <div class="testimonial__avatar">MR</div>
          <div>
            <div class="testimonial__name">Marcus Rivera</div>
            <div class="testimonial__role">Recipe developer, 28K subscribers</div>
          </div>
        </div>
      </div>

      <div class="testimonial">
        <div class="testimonial__quote">&ldquo;</div>
        <p class="testimonial__text">
          I turned my 50 best recipes into an ebook in under an hour. It's already my top-selling
          product on Kit. Dough pays for itself ten times over.
        </p>
        <div class="testimonial__author">
          <div class="testimonial__avatar">JO</div>
          <div>
            <div class="testimonial__name">Jamie Okafor</div>
            <div class="testimonial__role">Cooking influencer, 92K subscribers</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Latest from the blog -->
{#if data.posts && data.posts.length > 0}
  <section class="section section--warm">
    <div class="container">
      <div class="section__header reveal">
        <h2>Latest from the blog</h2>
        <p>Tips, guides, and insights for food creators building their recipe email business.</p>
      </div>

      <div class="blog-grid reveal-stagger">
        {#each data.posts as post (post.slug)}
          <a href="/blog/{post.slug}" class="blog-card">
            <div class="blog-card__date">{formatDate(post.date)}</div>
            <h3 class="blog-card__title">{post.title}</h3>
            <p class="blog-card__desc">{post.description}</p>
            <div class="blog-card__read">
              Read article <span class="blog-card__arrow">&rarr;</span>
            </div>
          </a>
        {/each}
      </div>

      <div class="blog-more reveal">
        <a href="/blog" class="btn btn--secondary">View all posts</a>
      </div>
    </div>
  </section>
{/if}

<!-- CTA -->
<section class="section cta-section">
  <div class="container">
    <div class="cta-block reveal">
      <h2>Ready to turn your recipes into revenue?</h2>
      <p>
        Connect your Kit account and start building your recipe-powered email business today. Free
        to start, no credit card required.
      </p>
      <a href="https://dash.makedough.app/sign-up" class="btn btn--primary btn--large"
        >Get started free</a
      >
    </div>
  </div>
</section>

<style>
  /* ---- Hero ---- */
  .hero {
    position: relative;
    min-height: 90vh;
    display: flex;
    align-items: center;
    padding: 6rem 0 4rem;
    background: linear-gradient(
      165deg,
      var(--color-cream) 0%,
      var(--color-parchment) 35%,
      #f8e8d6 65%,
      var(--color-cream) 100%
    );
    overflow: hidden;
  }

  .hero__grain {
    position: absolute;
    inset: -50%;
    width: 200%;
    height: 200%;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    animation: grain 8s steps(10) infinite;
    pointer-events: none;
    opacity: 0.5;
  }

  .hero__layout {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 4.5rem;
    align-items: center;
    position: relative;
    z-index: 1;
  }

  .hero__content {
    max-width: 600px;
  }

  .hero__title {
    margin-bottom: 1.75rem;
    font-size: 4.25rem;
    font-weight: 900;
    letter-spacing: -0.03em;
    line-height: 1.04;
  }

  .hero__title-line {
    display: block;
    animation: fadeInUp 0.8s var(--ease-out) both;
  }

  .hero__title-line--delay {
    animation-delay: 0.15s;
    color: var(--color-terracotta);
  }

  .hero__subtitle {
    font-size: 1.2rem;
    color: var(--color-text-secondary);
    line-height: 1.75;
    margin-bottom: 2.25rem;
    animation: fadeInUp 0.8s var(--ease-out) 0.3s both;
  }

  .hero__actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    animation: fadeInUp 0.8s var(--ease-out) 0.45s both;
  }

  /* Hero visual - mock recipe card */
  .hero__visual {
    display: flex;
    justify-content: center;
    animation: slideInRight 0.9s var(--ease-out) 0.3s both;
  }

  .hero__card {
    background: #fff;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    overflow: hidden;
    width: 100%;
    max-width: 360px;
    border: 1px solid rgba(232, 221, 208, 0.6);
    transition:
      transform 0.4s var(--ease-out),
      box-shadow 0.4s var(--ease-out);
  }

  .hero__card:hover {
    transform: translateY(-4px) rotate(-0.5deg);
    box-shadow: 0 20px 60px rgba(44, 24, 16, 0.15);
  }

  .hero__card-header {
    background: linear-gradient(145deg, #f0c89a, #e8a96f, #dfa060);
    padding: 3.5rem 1.75rem 1.25rem;
    position: relative;
  }

  .hero__card-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: var(--color-terracotta);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.3rem 0.7rem;
    border-radius: 100px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .hero__card-body {
    padding: 1.75rem;
  }

  .hero__card-body h3 {
    font-size: 1.3rem;
    margin-bottom: 0.75rem;
    font-weight: 700;
  }

  .hero__card-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 1.25rem;
    font-weight: 500;
  }

  .hero__card-meta span {
    position: relative;
  }

  .hero__card-meta span + span::before {
    content: "\00B7";
    position: absolute;
    left: -0.65rem;
    color: var(--color-border);
  }

  .hero__card-ingredients {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .hero__ingredient {
    height: 8px;
    background: var(--color-parchment);
    border-radius: 4px;
  }

  .hero__ingredient--short {
    width: 60%;
  }

  .hero__card-cta {
    background: var(--color-terracotta);
    color: #fff;
    text-align: center;
    padding: 0.75rem;
    border-radius: var(--radius);
    font-weight: 700;
    font-size: 0.9375rem;
    letter-spacing: 0.01em;
  }

  /* ---- Feature cards ---- */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2rem;
  }

  .feature-card {
    background: var(--color-cream);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    transition:
      box-shadow 0.35s var(--ease-out),
      transform 0.35s var(--ease-out);
  }

  .feature-card:hover {
    box-shadow: var(--shadow-lg);
    transform: scale(1.02);
  }

  .feature-card__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    background: var(--color-sage-bg);
    color: var(--color-sage);
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }

  .feature-card__icon--sage {
    background: var(--color-sage-bg);
    color: var(--color-sage);
  }

  .feature-card__icon--terracotta {
    background: rgba(199, 91, 57, 0.1);
    color: var(--color-terracotta);
  }

  .feature-card__icon--saffron {
    background: var(--color-saffron-bg);
    color: var(--color-saffron);
  }

  .feature-card h3 {
    font-size: 1.35rem;
    margin-bottom: 0.75rem;
    font-weight: 700;
  }

  .feature-card p {
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin: 0;
    font-size: 0.9875rem;
  }

  /* ---- Testimonials ---- */
  .testimonials {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }

  .testimonial {
    background: var(--color-bg-alt);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    border: 1px solid transparent;
    transition:
      border-color 0.3s var(--ease-out),
      box-shadow 0.3s var(--ease-out);
  }

  .testimonial:hover {
    border-color: var(--color-border);
    box-shadow: var(--shadow-md);
  }

  .testimonial__quote {
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 800;
    color: var(--color-saffron-light);
    line-height: 1;
    margin-bottom: -0.5rem;
    opacity: 0.6;
  }

  .testimonial__text {
    font-size: 1.05rem;
    line-height: 1.75;
    color: var(--color-text);
    margin-bottom: 1.75rem;
  }

  .testimonial__author {
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .testimonial__avatar {
    width: 2.75rem;
    height: 2.75rem;
    background: linear-gradient(135deg, var(--color-saffron), var(--color-terracotta));
    color: #fff;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.8rem;
    letter-spacing: 0.02em;
  }

  .testimonial__name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--color-text);
  }

  .testimonial__role {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  /* ---- Blog Section ---- */
  .blog-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }

  .blog-card {
    background: var(--color-cream);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 2.25rem;
    text-decoration: none;
    display: flex;
    flex-direction: column;
    transition:
      box-shadow 0.35s var(--ease-out),
      transform 0.35s var(--ease-out);
  }

  .blog-card:hover {
    box-shadow: var(--shadow-lg);
    transform: translateY(-4px);
    color: inherit;
  }

  .blog-card:hover .blog-card__arrow {
    transform: translateX(4px);
  }

  .blog-card__date {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.75rem;
  }

  .blog-card__title {
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--color-text);
    margin-bottom: 0.75rem;
  }

  .blog-card__desc {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.65;
    margin-bottom: 1.25rem;
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .blog-card__read {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-terracotta);
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .blog-card__arrow {
    display: inline-block;
    transition: transform 0.25s var(--ease-out);
  }

  .blog-more {
    text-align: center;
    margin-top: 3rem;
  }

  /* ---- CTA Section ---- */
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

  /* ---- Responsive ---- */
  @media (max-width: 768px) {
    .hero {
      padding: 3.5rem 0;
      min-height: auto;
    }

    .hero__layout {
      grid-template-columns: 1fr;
      gap: 3rem;
    }

    .hero__title {
      font-size: 2.5rem;
    }

    .hero__visual {
      order: -1;
    }

    .hero__card {
      max-width: 300px;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }

    .testimonials {
      grid-template-columns: 1fr;
    }

    .blog-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .testimonials {
      grid-template-columns: 1fr 1fr;
    }

    .blog-grid {
      grid-template-columns: 1fr 1fr;
    }

    .hero__title {
      font-size: 3.25rem;
    }
  }

  @media (max-width: 375px) {
    .hero__title {
      font-size: 2rem;
    }

    .hero__subtitle {
      font-size: 1.05rem;
    }
  }
</style>
