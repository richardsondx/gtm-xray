/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [],
  experimental: {
    serverComponentsExternalPackages: ["@modelcontextprotocol/sdk"],
  },
};

export default nextConfig;
