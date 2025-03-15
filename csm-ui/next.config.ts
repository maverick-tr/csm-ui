import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  reactStrictMode: true,
  
  // Add detailed MIME type configuration
  headers: async () => {
    return [
      {
        // For audio files
        source: '/audio/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'audio/wav',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
