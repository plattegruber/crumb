export interface PostMetadata {
  title: string;
  description: string;
  date: string;
  author: string;
  published: boolean;
  slug: string;
  readingTime: number;
}

export interface Post {
  metadata: PostMetadata;
  default: ConstructorOfATypedSvelteComponent;
}

function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export async function getPosts(): Promise<PostMetadata[]> {
  const modules = import.meta.glob<Record<string, string>>("/src/lib/posts/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  const metadataModules = import.meta.glob<{ metadata: Record<string, string> }>(
    "/src/lib/posts/*.md",
    {
      eager: true,
    },
  );

  const posts: PostMetadata[] = [];

  for (const [path, rawContent] of Object.entries(modules)) {
    const slug = path.split("/").pop()?.replace(".md", "") ?? "";
    const metaModule = metadataModules[path];

    if (!metaModule?.metadata) continue;

    const meta = metaModule.metadata;

    if (meta["published"] !== true && meta["published"] !== "true") continue;

    const content = typeof rawContent === "string" ? rawContent : "";
    const readingTime = estimateReadingTime(content);

    posts.push({
      title: String(meta["title"] ?? ""),
      description: String(meta["description"] ?? ""),
      date: String(meta["date"] ?? ""),
      author: String(meta["author"] ?? "Dough Team"),
      published: true,
      slug,
      readingTime,
    });
  }

  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

export async function getPost(
  slug: string,
): Promise<{ metadata: PostMetadata; content: ConstructorOfATypedSvelteComponent } | null> {
  const modules = import.meta.glob<Record<string, string>>("/src/lib/posts/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  });

  const componentModules = import.meta.glob("/src/lib/posts/*.md", {
    eager: true,
  });

  const path = `/src/lib/posts/${slug}.md`;
  const rawModule = modules[path];
  const componentModule = componentModules[path] as
    | { metadata: Record<string, string>; default: ConstructorOfATypedSvelteComponent }
    | undefined;

  if (!componentModule?.metadata) return null;

  const meta = componentModule.metadata;

  if (meta["published"] !== true && meta["published"] !== "true") return null;

  const content = typeof rawModule === "string" ? rawModule : "";
  const readingTime = estimateReadingTime(content);

  return {
    metadata: {
      title: String(meta["title"] ?? ""),
      description: String(meta["description"] ?? ""),
      date: String(meta["date"] ?? ""),
      author: String(meta["author"] ?? "Dough Team"),
      published: true,
      slug,
      readingTime,
    },
    content: componentModule.default,
  };
}
