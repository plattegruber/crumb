// ---------------------------------------------------------------------------
// Video platform URL detection (SPEC SS7 — import routing)
// ---------------------------------------------------------------------------
// Pure function that detects whether a URL points to a video on a supported
// platform and extracts the platform-specific video ID (shortcode).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Platform enum (const object, not TS enum per project style)
// ---------------------------------------------------------------------------

export const VIDEO_PLATFORM = {
  InstagramReel: "instagram_reel",
  TikTok: "tiktok",
  YouTube: "youtube",
} as const;

export type VideoPlatform = (typeof VIDEO_PLATFORM)[keyof typeof VIDEO_PLATFORM];

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface VideoPlatformDetection {
  readonly platform: VideoPlatform | null;
  readonly shortcode: string | null;
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// Instagram reels: instagram.com/reel/{id} or /reels/{id}, instagr.am/reel/{id}
// The shortcode is an alphanumeric string (may include _ and -)
const INSTAGRAM_REEL_RE =
  /^https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/reels?\/([A-Za-z0-9_-]+)/;

// TikTok long-form: tiktok.com/@user/video/{id}
const TIKTOK_VIDEO_RE = /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/(\d+)/;

// TikTok short link: vm.tiktok.com/{id}
const TIKTOK_SHORT_RE = /^https?:\/\/(?:www\.)?vm\.tiktok\.com\/([A-Za-z0-9_-]+)/;

// YouTube standard: youtube.com/watch?v={id}
const YOUTUBE_WATCH_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com|m\.youtube\.com)\/watch\?.*v=([A-Za-z0-9_-]{11})/;

// YouTube short link: youtu.be/{id}
const YOUTUBE_SHORT_RE = /^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/;

// YouTube Shorts: youtube.com/shorts/{id}
const YOUTUBE_SHORTS_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com|m\.youtube\.com)\/shorts\/([A-Za-z0-9_-]{11})/;

// ---------------------------------------------------------------------------
// Detection function
// ---------------------------------------------------------------------------

/**
 * Detect whether a URL points to a video on a supported platform.
 *
 * Returns the platform name and extracted video ID (shortcode) when the URL
 * matches a known pattern. Returns `{ platform: null, shortcode: null }` for
 * unrecognised URLs.
 *
 * This function is pure — it performs no I/O and has no side effects.
 */
export function detectVideoPlatform(url: string): VideoPlatformDetection {
  // Normalise: trim whitespace, strip trailing slash for consistency
  const trimmed = url.trim();

  // --- Instagram ---
  const igMatch = INSTAGRAM_REEL_RE.exec(trimmed);
  if (igMatch !== null && igMatch[1] !== undefined) {
    return { platform: VIDEO_PLATFORM.InstagramReel, shortcode: igMatch[1] };
  }

  // --- TikTok long-form ---
  const ttMatch = TIKTOK_VIDEO_RE.exec(trimmed);
  if (ttMatch !== null && ttMatch[1] !== undefined) {
    return { platform: VIDEO_PLATFORM.TikTok, shortcode: ttMatch[1] };
  }

  // --- TikTok short link ---
  const ttShortMatch = TIKTOK_SHORT_RE.exec(trimmed);
  if (ttShortMatch !== null && ttShortMatch[1] !== undefined) {
    return { platform: VIDEO_PLATFORM.TikTok, shortcode: ttShortMatch[1] };
  }

  // --- YouTube watch ---
  const ytWatchMatch = YOUTUBE_WATCH_RE.exec(trimmed);
  if (ytWatchMatch !== null && ytWatchMatch[1] !== undefined) {
    return { platform: VIDEO_PLATFORM.YouTube, shortcode: ytWatchMatch[1] };
  }

  // --- YouTube short link ---
  const ytShortMatch = YOUTUBE_SHORT_RE.exec(trimmed);
  if (ytShortMatch !== null && ytShortMatch[1] !== undefined) {
    return { platform: VIDEO_PLATFORM.YouTube, shortcode: ytShortMatch[1] };
  }

  // --- YouTube Shorts ---
  const ytShortsMatch = YOUTUBE_SHORTS_RE.exec(trimmed);
  if (ytShortsMatch !== null && ytShortsMatch[1] !== undefined) {
    return { platform: VIDEO_PLATFORM.YouTube, shortcode: ytShortsMatch[1] };
  }

  // --- No match ---
  return { platform: null, shortcode: null };
}
