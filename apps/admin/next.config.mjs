/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  transpilePackages: ['@lp/sdk', '@lp/types', '@lp/utils', '@lp/validators'],
};
export default nextConfig;
