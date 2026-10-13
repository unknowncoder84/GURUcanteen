import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BrightNest Food Solutions',
    short_name: 'BrightNest',
    description: 'Business tracking dashboard for BrightNest Food Solutions.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f8f6',
    theme_color: '#276f3d',
    icons: [
      { src: '/icon-light-32x32.png', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
