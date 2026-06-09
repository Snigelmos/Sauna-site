import { SITE } from "@config/site";

export function absUrl(path: string): string {
  if (!path) return SITE.url;
  if (path.startsWith("http")) return path;
  return new URL(path, SITE.url).toString();
}

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.publisher.name,
    url: SITE.url,
    logo: {
      "@type": "ImageObject",
      url: absUrl(SITE.publisher.logo),
    },
    description: SITE.author.bio,
    knowsAbout: [...SITE.author.knowsAbout],
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    inLanguage: SITE.language,
    publisher: { "@id": `${SITE.url}/#organization` },
  };
}

export function articleNode(opts: {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  image?: string;
}) {
  return {
    "@type": "Article",
    "@id": `${opts.url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
    headline: opts.headline,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    image: opts.image ? absUrl(opts.image) : absUrl(SITE.defaultImage),
    // Attributed to the editorial organization, not a fabricated person.
    author: { "@id": `${SITE.url}/#organization` },
    publisher: { "@id": `${SITE.url}/#organization` },
  };
}

export function breadcrumbNode(items: { label: string; url: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.label,
      item: absUrl(it.url),
    })),
  };
}

export function faqNode(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.a,
      },
    })),
  };
}

export function itemListNode(opts: { name: string; items: { name: string; url?: string }[] }) {
  return {
    "@type": "ItemList",
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { url: absUrl(it.url) } : {}),
    })),
  };
}

export function buildGraph(nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
