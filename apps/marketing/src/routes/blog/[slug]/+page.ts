import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  try {
    const post = await import(`../../../lib/posts/${params.slug}.md`);

    return {
      content: post.default,
      metadata: post.metadata as {
        title: string;
        description: string;
        date: string;
        author: string;
        published: boolean;
      },
    };
  } catch {
    throw error(404, "Post not found");
  }
};
