/*
 * Sauna accessories shown on detail pages. These are affiliate placements:
 * links carry rel="sponsored nofollow" and a visible disclosure. Swap the `url`
 * values for real affiliate links (Adtraction/Amazon/etc.) when set up; leave
 * the list empty to hide the block entirely.
 */
export interface Accessory {
  name: string;
  blurb: string;
  url: string;
  emoji: string;
}

export const ACCESSORIES: Accessory[] = [
  {
    name: "Badhandduk",
    blurb: "Stor, snabbtorkande handduk för bastu och kallbad.",
    url: "",
    emoji: "🧺",
  },
  {
    name: "Bastuhatt",
    blurb: "Ullhatt som skyddar håret och håller huvudet svalt.",
    url: "",
    emoji: "🎩",
  },
  {
    name: "Bastudoft (aufguss)",
    blurb: "Eteriska oljor för uppgjutning - eukalyptus, björk, mynta.",
    url: "",
    emoji: "🌿",
  },
];
