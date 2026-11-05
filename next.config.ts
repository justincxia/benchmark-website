import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.3 allows only one `next dev` per build directory (`.next/dev/lock`), so the
  // Playwright suite's server refuses to start while a dev server is running. Giving the
  // test server its own directory lets both run at once without disabling the lock.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
