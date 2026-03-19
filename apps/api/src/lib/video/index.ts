// ---------------------------------------------------------------------------
// Video module barrel export
// ---------------------------------------------------------------------------

export { detectVideoPlatform, VIDEO_PLATFORM } from "./url-detect.js";
export type { VideoPlatform, VideoPlatformDetection } from "./url-detect.js";

export { generateTempKey, uploadToTempR2, cleanupTempR2 } from "./temp-storage.js";
