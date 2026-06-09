/*
 * Sauna Finder - pilot data model.
 *
 * Directory-only: every entry links OUT to the venue's own booking page,
 * phone, or website. We do not host availability or take payments.
 *
 * PILOT DATA NOTICE: the five seed entries below are real, well-known Swedish
 * sauna/bath venues, but prices, hours, and booking details change often and
 * are illustrative. Each page shows a "last verified" date and a report-error
 * link, and the finder shows a pilot-data banner. Verify before relying on a
 * number. Do not fabricate ratings or first-hand testing.
 *
 * When the scraper pipeline lands (OSM Overpass + Google Places + manual
 * verification), it writes into this same shape.
 */

export type SaunaType =
  | "allman" // public drop-in sauna
  | "kallbadhus" // cold bath house with sauna
  | "spa" // spa / bath house
  | "uthyrning" // private rental
  | "flytande" // floating sauna / raft
  | "hotell"; // hotel sauna

export type BookingMethod = "online" | "telefon" | "drop-in" | "email";

export type PriceModel = "per-person" | "per-pass" | "per-timme" | "hela-bastun";

export interface OpeningHours {
  /** Short human label, e.g. "Man-Fre" */
  days: string;
  /** e.g. "07:00-21:00" or "Stangt" */
  hours: string;
}

/**
 * Machine-readable opening hours used to compute "öppet nu". `dow` follows
 * JS Date.getDay(): 0 = Sunday ... 6 = Saturday. Times are "HH:MM" (24h).
 */
export interface DayHours {
  dow: number;
  open: string;
  close: string;
}

export interface Sauna {
  slug: string;
  name: string;
  type: SaunaType;
  /** Short one-line summary shown on cards and meta description. */
  tagline: string;
  /** 2-3 sentence description for the detail page. */
  description: string;

  // Location
  address: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lng: number;

  // Contact / web
  website?: string;
  phone?: string;
  email?: string;

  // Booking (directory-only)
  bookable: boolean;
  bookingMethod: BookingMethod;
  bookingUrl?: string;

  // Price
  priceModel: PriceModel;
  priceFrom?: number;
  priceTo?: number;
  currency: "SEK";

  capacity?: number;

  // Amenities. Only known-true factors are rendered; absent/false = unknown.
  amenities: {
    coldPlunge?: boolean;
    seaAccess?: boolean;
    lakeAccess?: boolean;
    /** Swimming / dipping possible on site. */
    bathing?: boolean;
    woodFired?: boolean;
    showers?: boolean;
    changingRooms?: boolean;
    toilets?: boolean;
    parking?: boolean;
    towelRental?: boolean;
    cafe?: boolean;
    wheelchair?: boolean;
    /** Free to use (no entry fee). */
    freeEntry?: boolean;
  };
  /** "Mixed" or "Separate sessions" etc. */
  genderPolicy?: string;
  swimwearPolicy?: string;

  openingHours: OpeningHours[];
  /** Machine-readable hours for "öppet nu" (optional; harvested where available). */
  hours?: DayHours[];

  /** Practical, traveler-facing guidance / house rules. */
  instructions: string[];

  // Social proof (from Google via DataForSEO; linked out, never re-hosted)
  googleRating?: number;
  googleReviewsCount?: number;
  googleReviewsUrl?: string;

  // Media
  photo?: string;
  photoCredit?: string;

  // Commercial / quality
  /** Sponsored or claimed listing - gets subtle highlighting. */
  featured?: boolean;
  /** Human-curated/verified (vs auto-harvested). Drives the trust badge. */
  verified?: boolean;
  /** 0-1 data confidence (more sources + recent verification = higher). */
  confidence?: number;

  // Trust / provenance
  source: string;
  sourceUrl?: string;
  lastVerified: string;
}

/*
 * Records live in saunas.json (machine-owned: the harvest pipeline in
 * scripts/ writes that file). This module owns the TYPE + display helpers.
 * The cast is safe because merge-saunas.mjs normalizes every record to this
 * exact shape before writing.
 */
import saunasData from "./saunas.json";

export const SAUNAS: Sauna[] = saunasData as Sauna[];

// ---- Display helpers -------------------------------------------------------

export const TYPE_LABELS: Record<SaunaType, string> = {
  allman: "Public sauna",
  kallbadhus: "Cold bath house",
  spa: "Spa & bath",
  uthyrning: "Private rental",
  flytande: "Floating sauna",
  hotell: "Hotel sauna",
};

export const BOOKING_LABELS: Record<BookingMethod, string> = {
  online: "Book online",
  telefon: "Book by phone",
  "drop-in": "Drop-in",
  email: "Book by email",
};

export const PRICE_MODEL_LABELS: Record<PriceModel, string> = {
  "per-person": "per person",
  "per-pass": "per session",
  "per-timme": "per hour",
  "hela-bastun": "for the whole sauna",
};

export function formatPrice(s: Sauna): string {
  if (s.priceFrom == null) return "Price varies";
  const base =
    s.priceTo && s.priceTo !== s.priceFrom
      ? `${s.priceFrom}-${s.priceTo} kr`
      : `from ${s.priceFrom} kr`;
  return `${base} ${PRICE_MODEL_LABELS[s.priceModel]}`;
}

export function amenityLabels(s: Sauna): string[] {
  const a = s.amenities;
  const out: string[] = [];
  if (a.seaAccess) out.push("Sea bathing");
  if (a.lakeAccess) out.push("Lake bathing");
  if (a.bathing) out.push("Swimming");
  if (a.coldPlunge) out.push("Cold plunge");
  if (a.woodFired) out.push("Wood-fired");
  if (a.showers) out.push("Showers");
  if (a.changingRooms) out.push("Changing rooms");
  if (a.toilets) out.push("Toilets");
  if (a.parking) out.push("Parking");
  if (a.towelRental) out.push("Towel rental");
  if (a.cafe) out.push("Café");
  if (a.wheelchair) out.push("Accessible");
  if (a.freeEntry) out.push("Free entry");
  return out;
}

export function cities(): string[] {
  return [...new Set(SAUNAS.map((s) => s.city))].sort((a, b) => a.localeCompare(b, "sv"));
}

// ---- slugs for hub pages ---------------------------------------------------

export function citySlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Unique [city, slug] pairs that have at least `min` saunas. */
export function cityHubs(min = 1): { city: string; slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of SAUNAS) counts.set(s.city, (counts.get(s.city) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= min)
    .map(([city, count]) => ({ city, slug: citySlug(city), count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "sv"));
}

export function typeHubs(): { type: SaunaType; slug: SaunaType; count: number }[] {
  const counts = new Map<SaunaType, number>();
  for (const s of SAUNAS) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, slug: type, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- open now --------------------------------------------------------------

/** Is the sauna open at `now` (defaults to current Swedish local time)? */
export function isOpenNow(s: Sauna, now: Date = new Date()): boolean | null {
  if (!s.hours || s.hours.length === 0) return null;
  const dow = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return s.hours.some((h) => {
    if (h.dow !== dow) return false;
    const open = toMin(h.open);
    let close = toMin(h.close);
    if (close <= open) close += 24 * 60; // past-midnight
    return mins >= open && mins <= close;
  });
}

// ---- distance / nearby -----------------------------------------------------

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Nearest `n` other saunas to the given one. */
export function nearbySaunas(s: Sauna, n = 3): Sauna[] {
  return SAUNAS.filter((o) => o.slug !== s.slug)
    .map((o) => ({ o, d: distanceKm(s, o) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.o);
}
