# Home Sauna Guide

Independent, SEO-first affiliate site for home saunas, built with **Astro 5 + MDX + Tailwind 4**. People-first buyer guides, an interactive cost calculator, and strict E-E-A-T guardrails (no fabricated testing, ratings, or medical claims).

## Stack

- [Astro 5](https://astro.build) static site generation
- Tailwind 4 (via `@tailwindcss/vite`) + `@tailwindcss/typography`
- MDX, sitemap, and `astro-seo` for metadata + JSON-LD
- TypeScript (strict) with `@components`, `@layouts`, `@config`, `@data` path aliases

## Getting started

```bash
nvm use            # Node 22
npm install
npm run dev        # http://localhost:4321
npm run build      # astro check && astro build -> dist/
npm run preview
```

## Project structure

```
src/
  components/        UI + SaunaFormatIcon + schema/helpers.ts
  layouts/           BaseLayout, DecisionGuideLayout (buyer guides)
  config/            site.ts (brand, hubs, byline), affiliate.ts (Amazon tag + disclosures)
  data/              saunaCost.ts (cost-calculator data model)
  pages/
    index.astro                         homepage
    home-sauna/index.astro              flagship "best home sauna" buyer guide
    tools/sauna-cost-calculator.astro   interactive homemade-sauna cost estimator
    outdoor-sauna|portable-sauna|sauna-kits/   category stubs (noindexed until filled)
    methodology|about|disclosure|contact|privacy|404
public/              favicon.svg, logo.svg, og-default.svg, robots.txt
research/            citation-grade source dossiers (not deployed)
```

## Configuration

- **Brand / domain / hubs:** `src/config/site.ts` (brand "Home Sauna Guide", domain `thehomerecovery.com`).
- **Affiliate:** `amazonTag` in `src/config/affiliate.ts` is set to `thehomerecovery-20`. If reset to `PLACEHOLDER-20`, links render without a tag.
- **Images:** the GPT image API can replace the SVG placeholders/hero art later; nothing is hot-linked.

## Editorial guardrails

- No fabricated testing, ownership, ratings, or expert review.
- Structured data limited to Article, BreadcrumbList, FAQPage, ItemList - no Review/Product/AggregateRating until first-hand testing.
- Health content stays conservative and cited; costs are labeled planning ranges, not quotes.

See `src/pages/methodology.astro` and the `research/` dossiers for the full standard and sources.
