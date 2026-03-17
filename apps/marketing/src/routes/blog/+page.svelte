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
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );

    document.querySelectorAll(".reveal, .reveal-stagger").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  });
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

    <div class="blog-index__posts reveal-stagger">
      {#each data.posts as post (post.slug)}
        <a href="/blog/{post.slug}" class="post-card">
          <div class="post-card__content">
            <time datetime={post.date} class="post-card__date">{formatDate(post.date)}</time>
            <h2 class="post-card__title">{post.title}</h2>
            <p class="post-card__description">{post.description}</p>
            <div class="post-card__footer">
              <span class="post-card__author">{post.author}</span>
              <span class="post-card__dot"></span>
              <span class="post-card__reading">{post.readingTime} min read</span>
              <span class="post-card__arrow">&rarr;</span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  </div>
</section>

<style>
  .blog-index {
    padding: 5rem 0 7rem;
  }

  .blog-index__header {
    margin-bottom: 3.5rem;
  }

  .blog-index__header h1 {
    margin-bottom: 0.75rem;
    animation: fadeInUp 0.8s var(--ease-out) both;
  }

  .blog-index__header p {
    font-size: 1.2rem;
    color: var(--color-text-secondary);
    animation: fadeInUp 0.8s var(--ease-out) 0.15s both;
  }

  .blog-index__posts {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .post-card {
    display: block;
    background: var(--color-cream);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 2.25rem;
    text-decoration: none;
    transition:
      box-shadow 0.35s var(--ease-out),
      transform 0.35s var(--ease-out),
      border-color 0.35s var(--ease-out);
  }

  .post-card:hover {
    box-shadow: var(--shadow-lg);
    transform: translateY(-3px);
    color: inherit;
    border-color: var(--color-saffron-light);
  }

  .post-card:hover .post-card__arrow {
    transform: translateX(4px);
    opacity: 1;
  }

  .post-card__date {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }

  .post-card__title {
    font-size: 1.625rem;
    margin: 0.6rem 0 0.875rem;
    color: var(--color-text);
    font-family: var(--font-display);
    font-weight: 700;
    line-height: 1.25;
  }

  .post-card__description {
    color: var(--color-text-secondary);
    line-height: 1.7;
    margin-bottom: 1.25rem;
    font-size: 1.0125rem;
  }

  .post-card__footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .post-card__author {
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .post-card__dot {
    width: 3px;
    height: 3px;
    background: var(--color-text-muted);
    border-radius: 50%;
  }

  .post-card__arrow {
    margin-left: auto;
    font-size: 1.125rem;
    color: var(--color-terracotta);
    opacity: 0;
    transition:
      transform 0.25s var(--ease-out),
      opacity 0.25s var(--ease-out);
  }
</style>
