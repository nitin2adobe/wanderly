/** @type {import('next').NextConfig} */
const nextConfig = { agentRules: false, output: process.env.WANDERLY_STATIC_EXPORT === 'true' ? 'export' : undefined };
export default nextConfig;
