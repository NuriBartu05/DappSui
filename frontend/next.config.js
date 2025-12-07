/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Required for @mysten packages
    transpilePackages: ['@mysten/dapp-kit', '@mysten/sui'],
};

module.exports = nextConfig;
