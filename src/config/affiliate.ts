/*
 * Affiliate config. One file to edit when affiliate programs are approved.
 *
 * Replace amazonTag with your Amazon Associates tracking ID (looks like
 * "yourname-20"). While it stays as the placeholder, `decorateAmazonUrl`
 * returns links untouched (no fake tag) and `amazonSearchUrl` still builds a
 * working search link. Direct brand programs (Sun Home, Clearlight, Almost
 * Heaven, Redwood, HigherDose, Harvia, etc.) are added per-product on the page
 * via the manufacturer link once those programs are live.
 */
export const AFFILIATE = {
  amazonTag: "PLACEHOLDER-20" as string,
  storefrontDomain: "amazon.com",
  disclosure:
    "We may earn a commission when you buy through links on this page, at no extra cost to you. Commissions never influence which products we recommend or how we describe them, and we tell you when we have not tested something first-hand.",
  shortDisclosure:
    "Some links on this page are affiliate links. Commissions never change our recommendations.",
} as const;

export function decorateAmazonUrl(url: string): string {
  if (!AFFILIATE.amazonTag || AFFILIATE.amazonTag === "PLACEHOLDER-20") return url;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("amazon.com") && !u.hostname.endsWith("amazon.co.uk")) {
      return url;
    }
    u.searchParams.set("tag", AFFILIATE.amazonTag);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Build an Amazon search URL for a product query, with the affiliate tag
 * appended once it is configured. Used for product cards where we do not yet
 * have a single-product ASIN to link to.
 */
export function amazonSearchUrl(query: string): string {
  const base = `https://www.${AFFILIATE.storefrontDomain}/s?k=${encodeURIComponent(query)}`;
  return decorateAmazonUrl(base);
}
