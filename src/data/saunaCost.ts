/*
 * Data model for the homemade-sauna cost estimator (/tools/sauna-cost-calculator/).
 *
 * All figures are USD, 2026 national-average PLANNING RANGES - not quotes.
 * They are synthesized from multiple industry pricing guides (see saunaCostSources)
 * and cross-checked against the scenario totals in saunaScenarioChecks. The page
 * always outputs a low-high RANGE and shows an "estimate only" disclaimer.
 *
 * Source dossier: research/cost-calculator-model.md
 */

export interface Range {
  low: number;
  high: number;
}

export interface SizeBand {
  id: string;
  label: string;
  people: string;
  dims: string;
  floorM2: number;
  volumeM3: number;
  heaterKw: string;
  heatUp: string;
}

export const sizeBands: SizeBand[] = [
  { id: "1-2", label: "1-2 person (~1.2 x 1.8 m)", people: "1-2 people", dims: "~1.2 x 1.8 m", floorM2: 2.2, volumeM3: 4.8, heaterKw: "4.5-6 kW", heatUp: "25-35 min" },
  { id: "3-4", label: "3-4 person (~1.8 x 2.1 m)", people: "3-4 people", dims: "~1.8 x 2.1 m", floorM2: 3.8, volumeM3: 8.0, heaterKw: "6-8 kW", heatUp: "35-50 min" },
  { id: "5-6", label: "5-6 person (~2.1 x 2.4 m)", people: "5-6 people", dims: "~2.1 x 2.4 m", floorM2: 5.0, volumeM3: 10.6, heaterKw: "8-10.5 kW", heatUp: "45-60 min" },
  { id: "7+", label: "7+ person (large / custom)", people: "7+ people", dims: "~2.4 x 3.0 m+", floorM2: 7.2, volumeM3: 15.5, heaterKw: "12-18 kW", heatUp: "60-75 min" },
];

export const technologies = [
  { id: "electric", label: "Electricity", desc: "Electric heater", icon: "bolt" },
  { id: "wood", label: "Wood", desc: "Wood-burning stove", icon: "flame" },
  { id: "infrared", label: "Infrared", desc: "Plug-in panels", icon: "radiant" },
] as const;

export const tiers = [
  { id: "standard", label: "Standard", desc: "Spruce / hemlock, budget kit", icon: "layers" },
  { id: "premium", label: "Premium", desc: "Clear cedar / thermowood", icon: "sparkle" },
] as const;

export const buildPaths = [
  { id: "diy", label: "Full DIY", desc: "You build all of it", icon: "hammer" },
  { id: "diy_plus_electrical", label: "DIY + electrician", desc: "DIY shell, pro wiring", icon: "wrench" },
  { id: "contractor", label: "Contractor", desc: "Fully built for you", icon: "hardhat" },
] as const;

export const locations = [
  { id: "indoor", label: "Indoor", desc: "Garage, basement, room", icon: "house" },
  { id: "outdoor", label: "Outdoor", desc: "Backyard build", icon: "tree" },
] as const;

export const electricalSituations = [
  { id: "circuit_only", label: "Spare capacity - new circuit only" },
  { id: "panel_upgrade", label: "Panel / service upgrade needed" },
  { id: "outdoor_trench", label: "Outdoor run + trenching" },
] as const;

/*
 * COST BUILDING BLOCKS (all low-high ranges in USD).
 * The shell line for infrared already includes the radiant emitters, so the
 * heater line is zero for infrared.
 */

// shellCost[technology][tier][sizeId]
export const shellCost: Record<string, Record<string, Record<string, Range>>> = {
  electric: {
    standard: {
      "1-2": { low: 1700, high: 2800 },
      "3-4": { low: 2800, high: 4200 },
      "5-6": { low: 4000, high: 6000 },
      "7+": { low: 5500, high: 8500 },
    },
    premium: {
      "1-2": { low: 3300, high: 4700 },
      "3-4": { low: 4800, high: 6800 },
      "5-6": { low: 6500, high: 9200 },
      "7+": { low: 8800, high: 13000 },
    },
  },
  // Wood-burning uses the same cabin shell as a traditional electric build;
  // the difference is in the heater + chimney line below.
  wood: {
    standard: {
      "1-2": { low: 1700, high: 2800 },
      "3-4": { low: 2800, high: 4200 },
      "5-6": { low: 4000, high: 6000 },
      "7+": { low: 5500, high: 8500 },
    },
    premium: {
      "1-2": { low: 3300, high: 4700 },
      "3-4": { low: 4800, high: 6800 },
      "5-6": { low: 6500, high: 9200 },
      "7+": { low: 8800, high: 13000 },
    },
  },
  infrared: {
    standard: {
      "1-2": { low: 1200, high: 2300 },
      "3-4": { low: 2400, high: 3700 },
      "5-6": { low: 3600, high: 5200 },
      "7+": { low: 5000, high: 7000 },
    },
    premium: {
      "1-2": { low: 2800, high: 4200 },
      "3-4": { low: 4200, high: 5800 },
      "5-6": { low: 5600, high: 7400 },
      "7+": { low: 7200, high: 9500 },
    },
  },
};

// heaterCost[technology][sizeId]. Infrared = 0 (bundled into the shell).
// Wood includes the stove PLUS chimney + heat-shield install (2-3x electric).
export const heaterCost: Record<string, Record<string, Range>> = {
  electric: {
    "1-2": { low: 550, high: 850 },
    "3-4": { low: 850, high: 1250 },
    "5-6": { low: 1200, high: 1900 },
    "7+": { low: 1800, high: 3200 },
  },
  wood: {
    "1-2": { low: 3500, high: 6000 },
    "3-4": { low: 3900, high: 6600 },
    "5-6": { low: 4300, high: 7400 },
    "7+": { low: 4800, high: 8600 },
  },
  infrared: {
    "1-2": { low: 0, high: 0 },
    "3-4": { low: 0, high: 0 },
    "5-6": { low: 0, high: 0 },
    "7+": { low: 0, high: 0 },
  },
};

// Heater stones (electric/wood only).
export const stonesCost: Record<string, Range> = {
  electric: { low: 40, high: 70 },
  wood: { low: 40, high: 70 },
  infrared: { low: 0, high: 0 },
};

// Electrical by situation, for an electric heater. Includes permit.
export const electricalCost: Record<string, Range> = {
  circuit_only: { low: 800, high: 1350 },
  panel_upgrade: { low: 2500, high: 4100 },
  outdoor_trench: { low: 1450, high: 2700 },
};

// Wood needs only lighting/GFCI, not a heater circuit; infrared is plug-in.
export const electricalByTech: Record<string, Range> = {
  wood: { low: 100, high: 350 },
  infrared: { low: 0, high: 0 },
};

// Foundation (outdoor builds only).
export const foundationCost: Record<string, Range> = {
  standard: { low: 250, high: 450 }, // gravel pad / pavers
  premium: { low: 800, high: 1800 }, // poured concrete slab
};

export const accessoriesCost: Range = { low: 130, high: 270 };

// Operating cost (secondary output).
export const operatingCost: Record<
  string,
  { monthly: Range; perSession: Range; kwh?: number }
> = {
  electric: { monthly: { low: 18, high: 28 }, perSession: { low: 2, high: 4 } },
  wood: { monthly: { low: 15, high: 30 }, perSession: { low: 4, high: 7 } },
  infrared: { monthly: { low: 6, high: 13 }, perSession: { low: 1, high: 2 } },
};

export const estimatorMethodology: string[] = [
  "Start from a shell/structure cost for your size, material tier, and technology. For infrared, the radiant emitters are already bundled into the cabin price.",
  "Add the heater and stones (electric or wood). Wood-burning includes the chimney and heat-shield install, which is the reason it costs 2-3x an electric heater to fit.",
  "Add electrical. An electric heater needs a dedicated circuit run by a licensed electrician - we assume a standard new circuit indoors and a trenched run outdoors. If your panel is full and needs upgrading, add roughly $1,500-$2,500 on top. Infrared just plugs into a standard outlet, so its electrical line is zero.",
  "Add a foundation if you are building outdoors - a gravel pad for lighter builds, a poured slab for a heavy permanent cabin.",
  "Add accessories (backrest, bucket and ladle, thermometer, sauna-rated light).",
  "Apply labor. Full DIY is $0 in labor but 40-100+ hours of intermediate-to-advanced carpentry. A full contractor build adds close to the materials-plus-heater subtotal again.",
  "Report the most likely all-in cost as a tightened band around the central estimate (the individual line items rarely all land at their low or all at their high at the same time), and show the full low-high range per line below it.",
];

// Cross-check totals the live calculator output is sanity-checked against.
export const saunaScenarioChecks = [
  "Indoor conversion: DIY $2,000-$4,500 | contractor $5,000-$10,000",
  "Barrel kit: DIY $3,000-$7,000 | contractor $5,000-$10,000",
  "Outdoor cabin: DIY $5,000-$12,000 | contractor $12,000-$25,000",
  "Infrared prefab (plug-in): $1,000-$8,500 all-in, often $0 electrical",
];

export const saunaCostSources = [
  {
    name: "Haven of Heat - How much does a sauna cost (2026 pricing)",
    url: "https://havenofheat.com/blogs/sauna-guides/how-much-does-a-sauna-cost-the-complete-2026-pricing-guide",
    note: "2026 price bands for infrared, traditional, barrel, and custom saunas; install and operating costs.",
  },
  {
    name: "ThermalFinn - Sauna cost breakdown",
    url: "https://thermalfinn.com/sauna-builds/sauna-cost-breakdown/",
    note: "Itemized DIY materials, indoor vs outdoor totals, and the DIY-vs-contractor doubling rule.",
  },
  {
    name: "Home Made Sauna - Cost to build a backyard sauna (2026)",
    url: "https://homemadesauna.com/blogs/news/how-much-does-it-cost-to-build-a-backyard-sauna-2026",
    note: "Worked backyard-build example: materials plus electrical totals.",
  },
  {
    name: "Backyard Sauna Pro - Sauna electrical requirements",
    url: "https://backyardsaunapro.com/guides/sauna-electrical-requirements/",
    note: "240V circuit costs, panel upgrades, trenching, breaker and wire-gauge sizing.",
  },
  {
    name: "Sweat Decks - Sauna sizing and heater calculator",
    url: "https://sweatdecks.com/blogs/news/sauna-sizing",
    note: "Interior dimensions, cubic-foot volume, and heater kW by size band.",
  },
  {
    name: "SaunaKits - How much is a sauna heater",
    url: "https://saunakits.com/blogs/news/how-much-is-a-sauna-heater",
    note: "Electric heater price bands from entry units to premium HUUM/EOS.",
  },
];
