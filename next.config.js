/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Falha o build em erro de tipo/lint — NUNCA silenciar (Definition of Done)
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

module.exports = nextConfig;
