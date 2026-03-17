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
      <a href="/blog" class="blog-post__back">Back to blog</a>
      <h1>{title}</h1>
      <div class="blog-post__meta">
        <span class="blog-post__author">{author}</span>
        <span class="blog-post__separator">|</span>
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
    padding: 3rem 0 5rem;
  }

  .blog-post__header {
    margin-bottom: 3rem;
  }

  .blog-post__back {
    display: inline-block;
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-bottom: 1.5rem;
    text-decoration: none;
  }

  .blog-post__back:hover {
    color: var(--color-brand);
  }

  .blog-post__header h1 {
    font-size: 2.75rem;
    margin-bottom: 1rem;
    line-height: 1.15;
  }

  .blog-post__meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
  }

  .blog-post__author {
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .blog-post__separator {
    color: var(--color-border);
  }

  /* Prose styles for markdown content */
  .blog-post__content :global(h2) {
    font-size: 1.75rem;
    margin-top: 2.5rem;
    margin-bottom: 1rem;
  }

  .blog-post__content :global(h3) {
    font-size: 1.375rem;
    margin-top: 2rem;
    margin-bottom: 0.75rem;
  }

  .blog-post__content :global(p) {
    font-size: 1.0625rem;
    line-height: 1.8;
    color: var(--color-text-secondary);
    margin-bottom: 1.25rem;
  }

  .blog-post__content :global(ul),
  .blog-post__content :global(ol) {
    padding-left: 1.5rem;
    margin-bottom: 1.25rem;
  }

  .blog-post__content :global(li) {
    font-size: 1.0625rem;
    line-height: 1.7;
    color: var(--color-text-secondary);
    margin-bottom: 0.375rem;
  }

  .blog-post__content :global(strong) {
    color: var(--color-text);
    font-weight: 600;
  }

  .blog-post__content :global(a) {
    color: var(--color-brand);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .blog-post__content :global(a:hover) {
    color: var(--color-brand-dark);
  }

  .blog-post__content :global(blockquote) {
    border-left: 3px solid var(--color-brand);
    padding-left: 1.25rem;
    margin: 1.5rem 0;
    font-style: italic;
    color: var(--color-text-secondary);
  }

  .blog-post__content :global(code) {
    background: var(--color-bg-alt);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.9em;
  }

  .blog-post__content :global(pre) {
    background: var(--color-bg-dark);
    color: #e0e0e0;
    padding: 1.25rem;
    border-radius: var(--radius);
    overflow-x: auto;
    margin: 1.5rem 0;
  }

  .blog-post__content :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.875rem;
  }

  .blog-post__content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 2rem 0;
  }

  /* Footer CTA */
  .blog-post__footer {
    margin-top: 4rem;
    padding-top: 2rem;
    border-top: 1px solid var(--color-border);
  }

  .blog-post__cta {
    background: var(--color-brand-bg);
    border-radius: var(--radius-lg);
    padding: 2.5rem;
    text-align: center;
  }

  .blog-post__cta h3 {
    margin-bottom: 0.75rem;
  }

  .blog-post__cta p {
    color: var(--color-text-secondary);
    margin-bottom: 1.5rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
  }

  @media (max-width: 768px) {
    .blog-post__header h1 {
      font-size: 2rem;
    }
  }
</style>
