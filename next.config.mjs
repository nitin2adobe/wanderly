const staticExport = process.env.WANDERLY_STATIC_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  output: staticExport ? 'export' : undefined,
  // Static hosting has no server, so the export skips `.ts` API route handlers;
  // every page and layout is `.tsx`. Server builds and `next dev` keep the routes.
  ...(staticExport ? { pageExtensions: ['tsx', 'jsx'] } : {}),
};

export default nextConfig;
