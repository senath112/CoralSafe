
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
   // Potential fix for Leaflet/react-leaflet issues with SSR/dynamic imports
   // You might not need this, test first
   /*
   webpack: (config, { isServer }) => {
     if (!isServer) {
       // Fixes npm packages that depend on `fs` module
       config.resolve.fallback = {
         ...config.resolve.fallback,
         fs: false,
       };
     }
     return config;
   },
   */
};

export default nextConfig;
