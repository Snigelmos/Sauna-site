/*
 * Site identity and hub config. This is the ONE file to edit when the brand,
 * domain, or hub structure changes. Brand name and domain are placeholders
 * (Home Sauna Guide / homesaunaguide.com) - swap them here and everything else
 * (OG tags, schema, footer, canonical URLs) updates automatically.
 *
 * Authorship is a neutral editorial-team byline on purpose: we do not fabricate
 * a named person, credentials, first-hand testing, or expert review.
 */
export const SITE = {
  name: "Home Sauna Guide",
  shortName: "HSG",
  url: "https://www.homesaunaguide.com",
  description:
    "Independent buyer guides for home saunas: infrared cabins, outdoor and barrel saunas, portable saunas, sauna blankets, heaters, and DIY kits. We compare formats by home type, budget, space, and electrical needs - no fabricated testing, no fake ratings.",
  defaultImage: "/images/og/og-default.png",
  locale: "en_US",
  language: "en",
  twitter: "",
  publisher: {
    name: "Home Sauna Guide",
    logo: "/logo.svg",
  },
  // Neutral editorial-team byline (no fabricated individual). The schema layer
  // attributes articles to the Organization, not a Person.
  author: {
    name: "Home Sauna Guide Editorial Team",
    role: "Editorial team",
    bio: "We are an independent home-sauna research desk. We write buyer guides from manufacturer specifications, independent expert reviews, building-code and electrical references, and verified owner feedback. We disclose when we have not tested a product, we avoid star ratings on gear we have not used first-hand, and we keep health claims conservative and sourced.",
    knowsAbout: [
      "Home saunas",
      "Infrared saunas",
      "Outdoor and barrel saunas",
      "Portable saunas and sauna blankets",
      "Sauna heaters and DIY sauna builds",
      "Sauna electrical and installation requirements",
    ],
    image: "/logo.svg",
    url: "/about/",
  },
  contactEmail: "hello@homesaunaguide.com",
  // Analytics: Vercel Web Analytics (cookieless) is wired via the <Analytics />
  // component in BaseLayout and the outbound-click tracker reports custom events
  // to it. There is nothing to configure here - enable Analytics in the Vercel
  // project dashboard and it activates automatically on deploy.
  // Form backend for the "add your sauna" / "report error" pages. Set to a
  // Formspree endpoint (https://formspree.io/f/xxxx) to enable real forms;
  // when empty the pages fall back to a mailto link so nothing breaks.
  forms: {
    saunaSubmissionEndpoint: "",
  },
  jurisdiction: {
    country: "United States",
    governingLaw: "the laws of the United States",
  },
  defaultLastUpdated: "2026-06-08",
  accentColor: "#a15526",
  editorNote:
    "Updated June 2026. We are publishing buyer guides format by format. Guides are written from specs, independent reviews, code references, and owner feedback - not from first-hand testing yet. When we test, we publish the results separately and link them here.",
} as const;

export const HUBS = [
  {
    slug: "home-sauna",
    title: "Home Saunas",
    description:
      "Choose between infrared cabins, traditional indoor saunas, portable units, and blankets by home type and budget.",
    href: "/home-sauna/",
    icon: "cabin",
  },
  {
    slug: "outdoor-sauna",
    title: "Outdoor Saunas",
    description:
      "Barrel and cabin saunas for the backyard: wood-burning vs electric, foundation, and clearances.",
    href: "/outdoor-sauna/",
    icon: "barrel",
  },
  {
    slug: "portable-sauna",
    title: "Portable Saunas",
    description:
      "Apartment- and renter-friendly options: portable infrared tents, pods, and sauna blankets.",
    href: "/portable-sauna/",
    icon: "portable",
  },
  {
    slug: "sauna-kits",
    title: "DIY Sauna Builds",
    description:
      "Heaters, pre-cut kits, materials, sizing, and the electrical you need to build your own sauna.",
    href: "/sauna-kits/",
    icon: "kit",
  },
] as const;

export type HubSlug = (typeof HUBS)[number]["slug"];
