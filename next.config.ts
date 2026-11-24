import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16.3 allows only one `next dev` per build directory (`.next/dev/lock`), so the
  // Playwright suite's server refuses to start while a dev server is running. Giving the
  // test server its own directory lets both run at once without disabling the lock.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Files the server reads at request time, which tracing can't see (they are read through
  // process.cwd()): the stimulus lists and survey CSVs in seed/, and the stimuli manifest. On
  // Vercel each function gets only what is traced, so these must be named.
  outputFileTracingIncludes: {
    "/*": ["./seed/**/*", "./data/stimuli-manifest.json"],
    "/**": ["./seed/**/*", "./data/stimuli-manifest.json"],
  },
  // Clips are static files in public/stimuli/. Local test runs (AUDIO_DIR set, as the e2e suite
  // does with its tone fixtures) serve them from that folder through /api/audio instead, so a
  // test never touches the real audio in public/stimuli/ or the other way round.
  async rewrites() {
    return process.env.AUDIO_DIR
      ? { beforeFiles: [{ source: "/stimuli/:file", destination: "/api/audio/:file" }], afterFiles: [], fallback: [] }
      : [];
  },
  // The SONA survey is reached only by its study link: keep it out of search engines (the page
  // also sets a robots meta tag). Not listed in any robots.txt, which would advertise it.
  async headers() {
    return [{ source: "/arena/sonasurvey", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  // The two experiments used to be their own pages; they are now views of the leaderboard.
  async redirects() {
    return [
      { source: "/experiment-1", destination: "/leaderboard?exp=1", permanent: false },
      { source: "/experiment-2", destination: "/leaderboard?exp=2", permanent: false },
    ];
  },
};

export default nextConfig;
