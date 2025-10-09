// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'XR Blocks',
  tagline: 'XR and AI for the Web',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true,  // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: process.env.URL || 'https://your-docusaurus-site.example.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: process.env.BASE_URL || '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'google',  // Usually your GitHub org/user name.
  projectName: 'xrblocks',     // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  customFields: {
    xrblocksBaseUrl: process.env.XRBLOCKS_BASE_URL || 'http://localhost:8080/',
    codeSearchBaseUrl: process.env.CODE_SEARCH_BASE_URL || 'https://github.com/google/xrblocks/blob/main/',
    codeSearchLinkSuffix: process.env.CODE_SEARCH_LINK_SUFFIX || ""
  },

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/img/favicon.ico',
        sizes: 'any',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/img/favicon.svg',
        type: 'image/svg+xml',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        href: '/img/apple-touch-icon.png',
        sizes: '180x180',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/img/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/img/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'manifest',
        href: '/img/site.webmanifest',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'algolia-site-verification',
        content: 'C7A25C1609F793C8',
      },
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        gtag: {
          trackingID: 'G-5EK2RWYHRM',
          anonymizeIP: true,
        }
      }),
    ],
  ],

  themeConfig:
      /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
      ({
        colorMode: {
          respectPrefersColorScheme: true,
        },
        // Replace with your project's social card
        image: 'img/docusaurus-social-card.jpg',
        navbar: {
          title: 'XR Blocks',
          logo: {
            alt: 'XR Blocks Logo',
            src: 'img/logo.svg',
          },
          items: [
            {
              type: 'docSidebar',
              sidebarId: 'tutorialSidebar',
              position: 'left',
              label: 'Manual',
            },
            {
              type: 'docSidebar',
              sidebarId: 'typedocSidebar',
              position: 'left',
              label: 'API Reference',
            },
            {
              type: 'docSidebar',
              sidebarId: 'templatesSidebar',
              position: 'left',
              label: 'Templates',
            },
            {
              type: 'docSidebar',
              sidebarId: 'samplesSidebar',
              position: 'left',
              label: 'Samples',
            },
          ],
        },
        prism: {
          theme: prismThemes.github,
          darkTheme: prismThemes.dracula,
        },
      }),
  markdown: {format: 'detect', hooks: {onBrokenMarkdownLinks: 'warn'}},
  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        watch: process.env.TYPEDOC_WATCH?.toLowerCase() == 'true',
      },
    ],
  ],
};

export default config;
