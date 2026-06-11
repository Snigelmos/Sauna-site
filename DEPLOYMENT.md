# Deployment Runbook

Admin-only launch notes for getting Home Sauna Guide onto Vercel at `https://www.thehomerecovery.com`. Mirrors the Off-Grid Vehicle Camping guide setup.

## Current Hosting Target

- Host: Vercel
- Framework preset: Astro
- Package manager: npm
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`

The project is static Astro output (`output: "static"`), so it does not need serverless functions or a Vercel adapter for the first launch. `vercel.json` adds baseline security headers; `.vercelignore` keeps research/scripts/docs out of the deployment.

## Vercel Project Setup (GitHub-import flow)

1. Create a GitHub repo and push `main`:
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. Import the repo into Vercel (New Project -> Import Git Repository).
3. Confirm the Astro preset uses:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy. Verify the Vercel preview URL (see Pre-Publish Checks).
5. Add the production domain `thehomerecovery.com` and the `www` variant.
6. Set apex -> `www` (or your chosen canonical) redirect.
7. Wait for HTTPS certificates to become active, then promote to production.

## DNS Defaults

If DNS is managed outside Vercel:

- Apex `A`: `76.76.21.21`
- `www` `CNAME`: `cname.vercel-dns.com`

If using Cloudflare, keep proxying off until the Vercel certificate and redirects are confirmed.

## Domain Metadata (finalize before assigning the production domain)

Keep these aligned with the chosen canonical domain (currently `www.thehomerecovery.com`):

- `astro.config.mjs` -> `site`
- `src/config/site.ts` -> `SITE.url`
- `public/robots.txt` -> `Sitemap`

## Placeholders to finalize at launch

These ship as safe placeholders and degrade gracefully; finalize when ready:

- Amazon Associates tag: `src/config/affiliate.ts` -> `AFFILIATE.amazonTag` (set to `thehomerecovery-20`; if reset to `PLACEHOLDER-20`, links render untagged).
- Form backend: `src/config/site.ts` -> `forms.saunaSubmissionEndpoint` (empty = the add/report forms fall back to a mailto link). Use a Formspree endpoint (`https://formspree.io/f/xxxx`).

## Analytics

Analytics is Vercel Web Analytics (cookieless), wired via the `<Analytics />` component in `src/layouts/BaseLayout.astro`. The outbound-click tracker reports custom events to it. There is nothing to configure in the codebase and no domain to paste:

1. After importing the project, open the Vercel project -> Analytics tab and enable Web Analytics.
2. It activates automatically on the next production deploy; the script no-ops locally and on non-Vercel hosts.
3. Page-view analytics are included on all plans; custom events (outbound clicks) may require a paid plan.

## Pre-Publish Checks

Run before assigning the production domain or requesting indexing:

- `npm run build` passes (`astro check` + build).
- `/robots.txt` returns the real sitemap URL.
- `/sitemap-index.xml` is reachable.
- Homepage, the four category hubs, the guide hub + 5 articles, the cost calculator, and the finder render on the Vercel preview URL.
- All hero/format/guide images and `og-default.png` load (no broken images).
- Legal/trust pages (privacy, disclosure, about, methodology, contact) are public-ready.

## Search Console

Use DNS TXT verification if possible. After launch, submit:

- `https://www.thehomerecovery.com/sitemap-index.xml`

Request indexing for the homepage first, then the priority hub/guide pages.
