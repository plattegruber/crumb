<script lang="ts">
  const { title, description, date, author, children } = $props();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
</script>

<svelte:head>
  <title>{title} — Dough Blog</title>
  <meta name="description" content={description} />
</svelte:head>

<article class="blog-post">
  <div class="container--narrow">
    <header class="blog-post__header">
      <a href="/blog" class="blog-post__back">
        <span class="blog-post__back-arrow">&larr;</span> Back to blog
      </a>
      <h1>{title}</h1>
      <div class="blog-post__meta">
        <span class="blog-post__author">{author}</span>
        <span class="blog-post__separator"></span>
        <time datetime={date}>{formatDate(date)}</time>
      </div>
    </header>

    <div class="blog-post__content prose">
      {@render children()}
    </div>

    <footer class="blog-post__footer">
      <div class="blog-post__cta">
        <h3>Ready to try Dough?</h3>
        <p>Connect your Kit account and start building your recipe-powered email business.</p>
        <a href="https://dash.makedough.app/sign-up" class="btn btn--primary">Get started free</a>
      </div>
    </footer>
  </div>
</article>

<style>
  .blog-post {
    padding: 3.5rem 0 6rem;
  }

  .blog-post__header {
    margin-bottom: 3.5rem;
    animation: fadeInUp 0.8s var(--ease-out) both;
  }

  .blog-post__back {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin-bottom: 2rem;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;
  }

  .blog-post__back:hover {
    color: var(--color-terracotta);
  }

  .blog-post__back-arrow {
    transition: transform 0.2s var(--ease-out);
  }

  .blog-post__back:hover .blog-post__back-arrow {
    transform: translateX(-3px);
  }

  .blog-post__header h1 {
    font-size: 3rem;
    margin-bottom: 1.25rem;
    line-height: 1.12;
    letter-spacing: -0.025em;
    max-width: 680px;
  }

  .blog-post__meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
  }

  .blog-post__author {
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .blog-post__separator {
    width: 4px;
    height: 4px;
    background: var(--color-border);
    border-radius: 50%;
  }

  /* Prose styles for markdown content */
  .blog-post__content :global(h2) {
    font-size: 1.875rem;
    margin-top: 3rem;
    margin-bottom: 1rem;
    font-weight: 800;
  }

  .blog-post__content :global(h3) {
    font-size: 1.375rem;
    margin-top: 2.25rem;
    margin-bottom: 0.75rem;
    font-weight: 700;
  }

  .blog-post__content :global(p) {
    font-size: 1.0625rem;
    line-height: 1.85;
    color: var(--color-text-secondary);
    margin-bottom: 1.375rem;
    font-family: var(--font-display);
    font-weight: 400;
  }

  .blog-post__content :global(ul),
  .blog-post__content :global(ol) {
    padding-left: 1.5rem;
    margin-bottom: 1.375rem;
  }

  .blog-post__content :global(li) {
    font-size: 1.0625rem;
    line-height: 1.8;
    color: var(--color-text-secondary);
    margin-bottom: 0.425rem;
    font-family: var(--font-display);
    font-weight: 400;
  }

  .blog-post__content :global(strong) {
    color: var(--color-text);
    font-weight: 700;
  }

  .blog-post__content :global(a) {
    color: var(--color-terracotta);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(199, 91, 57, 0.3);
    transition: text-decoration-color 0.2s;
  }

  .blog-post__content :global(a:hover) {
    color: var(--color-terracotta-dark);
    text-decoration-color: var(--color-terracotta);
  }

  .blog-post__content :global(blockquote) {
    border-left: 3px solid var(--color-saffron);
    padding-left: 1.5rem;
    margin: 2rem 0;
    font-style: italic;
    color: var(--color-text-secondary);
  }

  .blog-post__content :global(blockquote p) {
    font-style: italic;
  }

  .blog-post__content :global(code) {
    background: var(--color-parchment);
    padding: 0.15rem 0.4rem;
    border-radius: 5px;
    font-size: 0.88em;
    border: 1px solid var(--color-border);
  }

  .blog-post__content :global(pre) {
    background: var(--color-charcoal);
    color: #d4c8be;
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    overflow-x: auto;
    margin: 2rem 0;
    border: 1px solid var(--color-charcoal-light);
  }

  .blog-post__content :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.875rem;
    border: none;
    color: #d4c8be;
  }

  .blog-post__content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 2.5rem 0;
  }

  /* Footer CTA */
  .blog-post__footer {
    margin-top: 4.5rem;
    padding-top: 2.5rem;
    border-top: 1px solid var(--color-border);
  }

  .blog-post__cta {
    background: linear-gradient(145deg, var(--color-parchment), var(--color-cream-warm));
    border-radius: var(--radius-xl);
    padding: 3rem;
    text-align: center;
    border: 1px solid var(--color-border);
  }

  .blog-post__cta h3 {
    margin-bottom: 0.75rem;
    font-weight: 800;
  }

  .blog-post__cta p {
    color: var(--color-text-secondary);
    margin-bottom: 1.75rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
    font-family: var(--font-body);
  }

  @media (max-width: 768px) {
    .blog-post__header h1 {
      font-size: 2.125rem;
    }
  }
</style>
