import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-25',
  devtools: { enabled: true },

  modules: ['@nuxtjs/supabase', '@nuxt/icon', '@vueuse/nuxt'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
    // maplibre-gl ships an ESM build that Vite prefers to pre-bundle up front
    optimizeDeps: { include: ['maplibre-gl'] },
  },

  supabase: {
    // No generated database types yet. Run
    //   npx supabase gen types typescript --project-id <ref> > app/types/database.types.ts
    // once the schema is live, then point this at that file for typed queries.
    types: false,

    // Every route requires a signed-in member except the two auth pages.
    redirect: true,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/login', '/confirm'],
    },
  },

  app: {
    head: {
      title: 'ourtracks',
      htmlAttrs: { lang: 'en', class: 'dark' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
        { name: 'description', content: 'A shared map of places and the songs that belong to them.' },
        { name: 'theme-color', content: '#0b0d10' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
