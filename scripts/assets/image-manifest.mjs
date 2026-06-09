/**
 * scripts/assets/image-manifest.mjs
 *
 * Declarative list of every generated image on the site. scripts/gen-images.mjs
 * iterates this, calls OpenAI gpt-image-1, and post-processes with sharp.
 *
 * Each entry:
 *   id     unique slug (also the raw filename in assets/generated/_raw)
 *   tier   1 | 2 | 3   (run order / batching)
 *   kind   "og" | "hero" | "card"   (drives generation size + final size + format)
 *   out    destination path under public/  (committed)
 *   prompt subject only - STYLE_SUFFIX + GUARDRAILS are appended automatically
 *   alt    descriptive, generic alt text (no brand/product claims)
 *
 * E-E-A-T: every image is generic and unbranded. Never depict a specific real
 * product/brand, no logos, no readable text, no implication we tested a unit.
 */

// Appended to every prompt for a consistent, premium, on-brand look.
export const STYLE_SUFFIX =
  "Editorial photorealistic photography, premium and calm mood. Warm cedar and honey-amber wood tones against soft charcoal and cream; gentle directional natural light, fine wood grain and subtle steam where relevant, shallow depth of field, crisp high detail, tasteful negative space for text overlay. Shot like a high-end architectural and wellness magazine.";

// gpt-image-1 has no separate negative field, so we bake guardrails into the prompt.
export const GUARDRAILS =
  "Do not include any brand logos, product names, readable text, signage, watermarks, screens, or user interfaces. No identifiable human faces. Avoid distorted anatomy and surreal artifacts.";

/**
 * Per-kind generation + output settings.
 *   gen    the size we ask the API for (closest supported aspect)
 *   final  the dimensions we crop/resize to with sharp
 *   format output file format(s)
 *   quality gpt-image-1 quality tier
 */
export const KINDS = {
  og: { gen: "1536x1024", final: { w: 1200, h: 630 }, format: ["png"], quality: "high" },
  hero: { gen: "1536x1024", final: { w: 1600, h: 900 }, format: ["webp"], quality: "high" },
  card: { gen: "1024x1024", final: { w: 900, h: 675 }, format: ["webp"], quality: "medium" },
};

export const images = [
  // ---- Tier 1: social + homepage ----------------------------------------
  {
    id: "og-default",
    tier: 1,
    kind: "og",
    out: "images/og/og-default.png",
    prompt:
      "A serene modern home sauna interior: cedar-lined walls and tiered benches, a stone sauna heater glowing softly, a wooden bucket and ladle, warm light and a faint wisp of steam. Wide cinematic composition with open space on the left third.",
    alt: "A warmly lit cedar home sauna interior with a stone heater and wooden bucket.",
  },
  {
    id: "home-hero",
    tier: 1,
    kind: "hero",
    out: "images/heroes/home-hero.webp",
    prompt:
      "A beautiful contemporary home sauna seen from the doorway: clear cedar cladding, layered benches, a sleek stone heater, soft amber lighting and gentle steam. Inviting, architectural, calm. Composition leaves the left side darker and uncluttered for headline text.",
    alt: "A modern cedar home sauna interior with soft steam and warm lighting.",
  },

  // ---- Tier 2: hub + guide heroes ---------------------------------------
  {
    id: "home-sauna",
    tier: 2,
    kind: "hero",
    out: "images/heroes/home-sauna.webp",
    prompt:
      "An indoor home sauna in a tasteful modern house: warm cedar walls, glass door, tiered benches and a stone heater, cozy evening light. Architectural interior photography, uncluttered left side for text.",
    alt: "An indoor home sauna with cedar walls, a glass door and a stone heater.",
  },
  {
    id: "outdoor-sauna",
    tier: 2,
    kind: "hero",
    out: "images/heroes/outdoor-sauna.webp",
    prompt:
      "A backyard outdoor sauna at dusk: a cedar barrel sauna and a small cabin sauna on a deck surrounded by trees, warm light glowing from the window, faint chimney smoke, calm twilight sky. Wide cinematic composition.",
    alt: "A cedar barrel and cabin sauna in a backyard at dusk with warm window light.",
  },
  {
    id: "portable-sauna",
    tier: 2,
    kind: "hero",
    out: "images/heroes/portable-sauna.webp",
    prompt:
      "A bright minimalist apartment corner set up for home recovery: a folded portable infrared sauna blanket on a bench beside a rolled towel and a glass of water, soft daylight, plants, clean Scandinavian styling. Calm and modern.",
    alt: "A portable infrared sauna blanket folded on a bench in a bright modern apartment.",
  },
  {
    id: "sauna-kits",
    tier: 2,
    kind: "hero",
    out: "images/heroes/sauna-kits.webp",
    prompt:
      "A DIY sauna build in progress: fresh cedar tongue-and-groove cladding partly installed over a foil vapor barrier and timber framing, a stone heater waiting to be fitted, neatly arranged hand tools and offcuts, warm workshop light. Craftsmanship feel.",
    alt: "A partly built sauna showing cedar cladding over a foil vapor barrier and framing.",
  },
  {
    id: "sauna-guide",
    tier: 2,
    kind: "hero",
    out: "images/heroes/sauna-guide.webp",
    prompt:
      "An atmospheric traditional sauna scene: water being ladled over hot stones creating a burst of steam (loyly), warm low light on cedar benches, a birch whisk resting nearby. Evocative, sensory, premium.",
    alt: "Water ladled over hot sauna stones creating steam, with cedar benches and a birch whisk.",
  },
  {
    id: "guide-benefits",
    tier: 2,
    kind: "hero",
    out: "images/guide/benefits.webp",
    prompt:
      "A calm wellness still life: a quiet cedar sauna bench with a folded linen towel and a glass of water in warm soft light, gentle steam in the background. Restful, health-and-recovery mood.",
    alt: "A folded towel and a glass of water on a cedar sauna bench in soft light.",
  },
  {
    id: "guide-how-to-use",
    tier: 2,
    kind: "hero",
    out: "images/guide/how-to-use.webp",
    prompt:
      "A traditional sauna ritual scene: a wooden bucket and ladle beside hot stones on a heater, a towel on the bench, soft steam rising, warm cedar tones. Inviting and instructional.",
    alt: "A wooden bucket and ladle beside a sauna heater with rising steam.",
  },
  {
    id: "guide-temperature",
    tier: 2,
    kind: "hero",
    out: "images/guide/temperature.webp",
    prompt:
      "A close, tactile shot of a sauna heater topped with dark stones radiating heat, a classic round wall thermometer and hygrometer on warm cedar planks nearby, soft heat shimmer. No readable numbers.",
    alt: "A sauna stone heater with a round wall thermometer on cedar wall planks.",
  },
  {
    id: "guide-frequency",
    tier: 2,
    kind: "hero",
    out: "images/guide/frequency.webp",
    prompt:
      "A serene weekly-routine mood: an empty, freshly prepared cedar sauna with neatly placed towels and a glass of water, calm morning light through a small window. Tidy, habitual, healthy.",
    alt: "A tidy cedar sauna with folded towels and a glass of water in calm light.",
  },
  {
    id: "guide-safety",
    tier: 2,
    kind: "hero",
    out: "images/guide/safety.webp",
    prompt:
      "A reassuring sauna safety scene: a glass of water and a towel on a cedar bench beside a sand timer (hourglass) and a safely guarded stone heater in the background, calm balanced light. Sensible and trustworthy.",
    alt: "A glass of water, towel and sand timer on a cedar sauna bench near a guarded heater.",
  },

  // ---- Tier 3: generic format / heater card visuals ---------------------
  {
    id: "infrared-cabin",
    tier: 3,
    kind: "card",
    out: "images/formats/infrared-cabin.webp",
    prompt:
      "A generic one-to-two person infrared sauna cabin in a bright modern room: light wood exterior, full glass front door, visible flat carbon heating panels inside, a small bench. Clean studio-style product photography on a neutral warm background.",
    alt: "A small infrared sauna cabin with a glass door and interior heating panels.",
  },
  {
    id: "traditional-cabin",
    tier: 3,
    kind: "card",
    out: "images/formats/traditional-cabin.webp",
    prompt:
      "A generic traditional indoor sauna cabin: clear cedar walls, a glass door, tiered benches inside and a stone heater visible through the doorway. Clean product photography on a neutral warm background.",
    alt: "A traditional cedar sauna cabin with a glass door, tiered benches and a stone heater.",
  },
  {
    id: "barrel-outdoor",
    tier: 3,
    kind: "card",
    out: "images/formats/barrel-outdoor.webp",
    prompt:
      "A generic cedar barrel sauna outdoors on a wooden deck, round profile, small chimney, a window in the door, surrounded by greenery in soft daylight. Clean lifestyle product photography.",
    alt: "A cedar barrel sauna with a chimney on a wooden deck surrounded by greenery.",
  },
  {
    id: "portable-blanket",
    tier: 3,
    kind: "card",
    out: "images/formats/portable-blanket.webp",
    prompt:
      "A generic infrared sauna blanket laid out flat and partly folded on a clean surface, quilted padded texture in a calm neutral color, a rolled towel beside it. Bright minimalist product photography on a neutral warm background.",
    alt: "A quilted infrared sauna blanket laid out beside a rolled towel.",
  },
  {
    id: "portable-tent",
    tier: 3,
    kind: "card",
    out: "images/formats/portable-tent.webp",
    prompt:
      "A generic portable personal sauna tent: a compact fabric dome on a folding frame with a small steam unit beside it, neutral color, set up in a bright room. Clean product photography on a neutral warm background.",
    alt: "A compact portable sauna tent with a small steam unit in a bright room.",
  },
  {
    id: "diy-kit",
    tier: 3,
    kind: "card",
    out: "images/formats/diy-kit.webp",
    prompt:
      "A generic pre-cut sauna kit ready to assemble: neatly stacked cedar wall and bench panels, a coil of foil vapor barrier and a boxed stone heater on a workshop floor in warm light. Clean documentary product photography.",
    alt: "Stacked cedar panels, a roll of foil vapor barrier and a boxed heater for a DIY sauna kit.",
  },
  {
    id: "electric-heater",
    tier: 3,
    kind: "card",
    out: "images/formats/electric-heater.webp",
    prompt:
      "A generic modern electric sauna heater mounted on a cedar wall, a tower of dark sauna stones on top, simple unbranded body, warm side light. Clean product photography on a neutral warm background.",
    alt: "A modern electric sauna heater topped with dark stones on a cedar wall.",
  },
  {
    id: "wood-stove",
    tier: 3,
    kind: "card",
    out: "images/formats/wood-stove.webp",
    prompt:
      "A generic wood-burning sauna stove in matte black steel with a glass fire door glowing warmly and a rack of sauna stones on top, a small stack of firewood beside it on a stone hearth. Clean product photography.",
    alt: "A black wood-burning sauna stove with a glowing fire door and stones on top.",
  },
];
