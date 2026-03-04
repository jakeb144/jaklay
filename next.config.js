/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  // Allow API routes to run for up to 60s (Vercel Pro) or 10s (Hobby)
  // For longer enrichment jobs, we use self-chaining
  serverExternalPackages: [],
};

module.exports = nextConfig;
