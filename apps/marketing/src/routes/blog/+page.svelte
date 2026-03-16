<script lang="ts">
  const { data } = $props();

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
</script>

<svelte:head>
  <title>Blog — Dough</title>
  <meta
    name="description"
    content="Tips, guides, and insights for food creators building their recipe email business with Kit."
  />
</svelte:head>

<section class="blog-index">
  <div class="container--narrow">
    <header class="blog-index__header">
      <h1>Blog</h1>
      <p>Tips, guides, and insights for food creators building their recipe email business.</p>
    </header>

    <div class="blog-index__posts">
      {#each data.posts as post (post.slug)}
        <a href="/blog/{post.slug}" class="post-card">
          <div class="post-card__content">
            <time datetime={post.date} class="post-card__date">{formatDate(post.date)}</time>
            <h2 class="post-card__title">{post.title}</h2>
            <p class="post-card__description">{post.description}</p>
            <div class="post-card__meta">
              <span class="post-card__author">{post.author}</span>
              <span class="post-card__reading">{post.readingTime} min read</span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  </div>
</section>

<style>
  .blog-index {
    padding: 4rem 0 6rem;
  }

  .blog-index__header {
    margin-bottom: 3rem;
  }

  .blog-index__header h1 {
    margin-bottom: 0.75rem;
  }

  .blog-index__header p {
    font-size: 1.125rem;
    color: var(--color-text-secondary);
  }

  .blog-index__posts {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .post-card {
    display: block;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 2rem;
    text-decoration: none;
    transition:
      box-shadow 0.2s,
      transform 0.2s;
  }

  .post-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
    color: inherit;
  }

  .post-card__date {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .post-card__title {
    font-size: 1.5rem;
    margin: 0.5rem 0 0.75rem;
    color: var(--color-text);
    font-family: var(--font-display);
    line-height: 1.3;
  }

  .post-card__description {
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin-bottom: 1rem;
  }

  .post-card__meta {
    display: flex;
    gap: 1rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .post-card__author {
    font-weight: 500;
  }
</style>
