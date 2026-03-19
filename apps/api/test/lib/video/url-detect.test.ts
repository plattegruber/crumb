// ---------------------------------------------------------------------------
// Tests for video platform URL detection
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { detectVideoPlatform, VIDEO_PLATFORM } from "../../../src/lib/video/url-detect.js";

// ---------------------------------------------------------------------------
// Instagram Reels
// ---------------------------------------------------------------------------

describe("detectVideoPlatform — Instagram Reels", () => {
  it("detects instagram.com/reel/{id}", () => {
    const result = detectVideoPlatform("https://www.instagram.com/reel/ABC123def_-/");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("ABC123def_-");
  });

  it("detects instagram.com/reels/{id} (plural)", () => {
    const result = detectVideoPlatform("https://www.instagram.com/reels/XYZ789/");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("XYZ789");
  });

  it("detects instagr.am/reel/{id} (short domain)", () => {
    const result = detectVideoPlatform("https://instagr.am/reel/ABC123/");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("ABC123");
  });

  it("works without www prefix", () => {
    const result = detectVideoPlatform("https://instagram.com/reel/DEF456/");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("DEF456");
  });

  it("works without trailing slash", () => {
    const result = detectVideoPlatform("https://www.instagram.com/reel/GHI789");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("GHI789");
  });

  it("works with query parameters", () => {
    const result = detectVideoPlatform(
      "https://www.instagram.com/reel/ABC123/?igsh=abc123&utm_source=share",
    );
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("ABC123");
  });

  it("works with http (not https)", () => {
    const result = detectVideoPlatform("http://www.instagram.com/reel/ABC123/");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("ABC123");
  });

  it("does not match instagram.com/p/{id} (photo post, not reel)", () => {
    const result = detectVideoPlatform("https://www.instagram.com/p/ABC123/");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("does not match instagram.com profile URL", () => {
    const result = detectVideoPlatform("https://www.instagram.com/username/");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

describe("detectVideoPlatform — TikTok", () => {
  it("detects tiktok.com/@user/video/{id}", () => {
    const result = detectVideoPlatform(
      "https://www.tiktok.com/@username/video/7123456789012345678",
    );
    expect(result.platform).toBe(VIDEO_PLATFORM.TikTok);
    expect(result.shortcode).toBe("7123456789012345678");
  });

  it("works without www", () => {
    const result = detectVideoPlatform("https://tiktok.com/@chef.mike/video/7123456789012345678");
    expect(result.platform).toBe(VIDEO_PLATFORM.TikTok);
    expect(result.shortcode).toBe("7123456789012345678");
  });

  it("works with query parameters", () => {
    const result = detectVideoPlatform(
      "https://www.tiktok.com/@username/video/7123456789012345678?is_from_webapp=1&sender_device=pc",
    );
    expect(result.platform).toBe(VIDEO_PLATFORM.TikTok);
    expect(result.shortcode).toBe("7123456789012345678");
  });

  it("handles usernames with dots and underscores", () => {
    const result = detectVideoPlatform(
      "https://www.tiktok.com/@chef_bob.cooks/video/7123456789012345678",
    );
    expect(result.platform).toBe(VIDEO_PLATFORM.TikTok);
    expect(result.shortcode).toBe("7123456789012345678");
  });

  it("detects vm.tiktok.com/{id} (short link)", () => {
    const result = detectVideoPlatform("https://vm.tiktok.com/ZMrABC123/");
    expect(result.platform).toBe(VIDEO_PLATFORM.TikTok);
    expect(result.shortcode).toBe("ZMrABC123");
  });

  it("detects vm.tiktok.com short link without trailing slash", () => {
    const result = detectVideoPlatform("https://vm.tiktok.com/ZMrABC123");
    expect(result.platform).toBe(VIDEO_PLATFORM.TikTok);
    expect(result.shortcode).toBe("ZMrABC123");
  });

  it("does not match tiktok.com profile URL", () => {
    const result = detectVideoPlatform("https://www.tiktok.com/@username");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

describe("detectVideoPlatform — YouTube", () => {
  it("detects youtube.com/watch?v={id}", () => {
    const result = detectVideoPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("works without www", () => {
    const result = detectVideoPlatform("https://youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("works with m.youtube.com (mobile)", () => {
    const result = detectVideoPlatform("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("works with additional query parameters after v=", () => {
    const result = detectVideoPlatform(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLtest",
    );
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("works when v= is not the first query parameter", () => {
    const result = detectVideoPlatform("https://www.youtube.com/watch?list=PLtest&v=dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("detects youtu.be/{id} (short link)", () => {
    const result = detectVideoPlatform("https://youtu.be/dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("detects youtu.be with query params", () => {
    const result = detectVideoPlatform("https://youtu.be/dQw4w9WgXcQ?t=30");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("detects youtube.com/shorts/{id}", () => {
    const result = detectVideoPlatform("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("detects youtube.com/shorts with trailing slash", () => {
    const result = detectVideoPlatform("https://www.youtube.com/shorts/dQw4w9WgXcQ/");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("detects m.youtube.com/shorts/{id}", () => {
    const result = detectVideoPlatform("https://m.youtube.com/shorts/dQw4w9WgXcQ");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });

  it("does not match youtube.com channel URL", () => {
    const result = detectVideoPlatform("https://www.youtube.com/@channelname");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("does not match youtube.com playlist URL", () => {
    const result = detectVideoPlatform("https://www.youtube.com/playlist?list=PLtest123");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Non-matching URLs
// ---------------------------------------------------------------------------

describe("detectVideoPlatform — non-matching URLs", () => {
  it("returns null for a regular recipe blog URL", () => {
    const result = detectVideoPlatform("https://www.seriouseats.com/best-pasta-recipe");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for an empty string", () => {
    const result = detectVideoPlatform("");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for a random string (not a URL)", () => {
    const result = detectVideoPlatform("not a url at all");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for a URL with 'instagram' in the path but different domain", () => {
    const result = detectVideoPlatform("https://example.com/instagram/reel/ABC123");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for a URL with 'tiktok' in the path but different domain", () => {
    const result = detectVideoPlatform("https://example.com/tiktok/@user/video/123");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for a URL with 'youtube' in the path but different domain", () => {
    const result = detectVideoPlatform("https://example.com/youtube/watch?v=abc");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for facebook video URL", () => {
    const result = detectVideoPlatform("https://www.facebook.com/watch/?v=123456789");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("returns null for twitter/x video URL", () => {
    const result = detectVideoPlatform("https://x.com/user/status/123456789");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("detectVideoPlatform — edge cases", () => {
  it("trims leading and trailing whitespace", () => {
    const result = detectVideoPlatform("  https://www.instagram.com/reel/ABC123/  ");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("ABC123");
  });

  it("handles YouTube video ID with hyphens and underscores", () => {
    const result = detectVideoPlatform("https://www.youtube.com/watch?v=a-B_c1D2e3f");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("a-B_c1D2e3f");
  });

  it("handles Instagram shortcode with hyphens and underscores", () => {
    const result = detectVideoPlatform("https://www.instagram.com/reel/A_b-C123/");
    expect(result.platform).toBe(VIDEO_PLATFORM.InstagramReel);
    expect(result.shortcode).toBe("A_b-C123");
  });

  it("does not match youtube URL with video ID shorter than 11 chars", () => {
    const result = detectVideoPlatform("https://www.youtube.com/watch?v=short");
    expect(result.platform).toBeNull();
    expect(result.shortcode).toBeNull();
  });

  it("handles YouTube Shorts with query parameters", () => {
    const result = detectVideoPlatform("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share");
    expect(result.platform).toBe(VIDEO_PLATFORM.YouTube);
    expect(result.shortcode).toBe("dQw4w9WgXcQ");
  });
});
