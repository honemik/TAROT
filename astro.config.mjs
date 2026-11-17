import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://honemik-astro-blog.pages.dev',
  base: '/TAROT/',
  trailingSlash: 'always',
  output: 'static',
  devToolbar: { enabled: false },
  vite: { server: { host: '0.0.0.0' } },
});
