// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://www.thehomerecovery.com",
  output: "static",
  integrations: [
    mdx(),
    sitemap({
      // Keep noindex routes out of the sitemap so we don't ask Google to crawl
      // pages we've told it not to index. Currently every sauna-finder city hub
      // is noindex (thin: <3 listings, max is 2) and the add/report form is
      // noindex. Revisit this path filter if a city ever reaches >=3 listings
      // and should be indexed.
      filter: (page) =>
        !page.includes("/sauna-finder/city/") && !page.includes("/sauna-finder/add/"),
      serialize(item) {
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
  ],
  vite: {
    plugins: [/** @type {any} */ (tailwindcss())],
  },
  build: {
    format: "directory",
  },
  trailingSlash: "always",
});
