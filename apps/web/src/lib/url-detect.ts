// ---------------------------------------------------------------------------
// Client-side video URL detection
// ---------------------------------------------------------------------------
// Mirrors the regex patterns from the API's video/url-detect.ts so the
// frontend can show an informational indicator before submission.  The
// actual import routing is still handled server-side — this is purely UX.
// ---------------------------------------------------------------------------

export interface VideoUrlDetection {
  readonly isVideo: boolean;
  readonly platform: string | null;
}

// --- Instagram reels ---
const INSTAGRAM_REEL_RE =
  /^https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/reels?\/[A-Za-z0-9_-]+/;

// --- TikTok ---
const TIKTOK_VIDEO_RE = /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/;
const TIKTOK_SHORT_RE = /^https?:\/\/(?:www\.)?vm\.tiktok\.com\/[A-Za-z0-9_-]+/;

// --- YouTube ---
const YOUTUBE_WATCH_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com|m\.youtube\.com)\/watch\?.*v=[A-Za-z0-9_-]{11}/;
const YOUTUBE_SHORT_RE = /^https?:\/\/(?:www\.)?youtu\.be\/[A-Za-z0-9_-]{11}/;
const YOUTUBE_SHORTS_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com|m\.youtube\.com)\/shorts\/[A-Za-z0-9_-]{11}/;

/**
 * Detect whether a URL points to a video on a supported platform.
 *
 * Returns `{ isVideo: true, platform }` when the URL matches a known video
 * pattern, or `{ isVideo: false, platform: null }` otherwise.
 */
export function isVideoUrl(url: string): VideoUrlDetection {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { isVideo: false, platform: null };
  }

  if (INSTAGRAM_REEL_RE.test(trimmed)) {
    return { isVideo: true, platform: "Instagram Reel" };
  }

  if (TIKTOK_VIDEO_RE.test(trimmed) || TIKTOK_SHORT_RE.test(trimmed)) {
    return { isVideo: true, platform: "TikTok" };
  }

  if (
    YOUTUBE_WATCH_RE.test(trimmed) ||
    YOUTUBE_SHORT_RE.test(trimmed) ||
    YOUTUBE_SHORTS_RE.test(trimmed)
  ) {
    return { isVideo: true, platform: "YouTube" };
  }

  return { isVideo: false, platform: null };
}
