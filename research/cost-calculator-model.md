# Homemade-Sauna Cost Estimator - data model + cost ranges

Source material and a ready-to-implement model for `/tools/sauna-cost-calculator/`. Mirror the architecture of the reference power tool: a typed data module (`src/data/saunaCost.ts`) consumed by an Astro page with an inline `<script>` that reads JSON, computes, and renders a low-high range. See `Camping lifestyle/src/data/powerSizing.ts` and `src/pages/tools/power-station-sizing.astro`.

All figures USD, 2026 national averages. These are PLANNING RANGES, not quotes. The page must show an "estimate only" disclaimer and tell users to get a written local electrician quote.

## User inputs (as requested)
1. **Size** - person/footprint band
2. **Material tier** - standard vs premium
3. **Sauna technology** - traditional electric / wood-burning / infrared
4. **Build path** - full DIY / DIY shell + pro electrical / full carpenter-contractor
5. **Electrical situation** - panel has capacity (circuit only) / needs panel upgrade / outdoor run + trenching (auto-skipped for infrared on 120V)
6. (Optional) **Location** - indoor conversion vs outdoor build (drives foundation + trenching)

## Size bands (interior), volume, heater kW, heat-up
Source: ThermalFinn build guide; Sweat Decks sizing; Haven of Heat sizing.

- **1-2 person** - 4x6 ft, ~24 sq ft, ~168 cu ft, heater 4.5-6 kW, heat-up 25-35 min
- **2-3 person** - 5x7 ft, ~35 sq ft, ~245 cu ft, heater 6-8 kW, heat-up 30-45 min
- **3-4 person** - 6x8 ft, ~48 sq ft, ~336 cu ft, heater 8-9 kW, heat-up 40-55 min
- **4-6 person** - 7x9 ft, ~63 sq ft, ~441 cu ft, heater 9-12 kW, heat-up 45-65 min

Heater sizing rule: ~1 kW per 45-50 cu ft; add 15-25% for glass doors/windows, poor insulation, or cold climate. Every sq ft of glass ~= +6 cu ft; uninsulated/log walls +25-50% effective volume.
Circuit by kW (traditional, 240V): 3-4.5 kW -> 20A/#12; 6 kW -> 30A/#10; 8-9 kW -> 40A/#8; 10-12 kW -> 50A/#6.
Person-capacity labels are inflated; reduce advertised capacity ~25-33% for real comfort.

## Component cost ranges (the model's building blocks)

### A. Shell / structure
**Build-from-scratch materials (DIY)** - itemized (Sauna Guide, Peak Primal, Home Made Sauna):
- Framing lumber (2x4): $380-$580
- Interior lining lumber (cedar/hemlock/spruce): $800-$2,500
- Insulation + foil vapor barrier: $150-$400
- Door (glass or wood): $200-$800
- Ventilation components: $50-$200
- Hardware/screws/trim: $100-$300
- Sauna-rated lighting: $50-$200
- Bench lumber (aspen/abachi/cedar): included in lining range or +$150-$350 pre-cut bench kit

Scratch-materials totals by location (ThermalFinn): indoor conversion $1,500-$3,500; outdoor cabin $3,500-$9,000.

**Kit (pre-cut shell) instead of scratch:**
- Barrel sauna kit: entry spruce ~$2,500; premium thermowood/cedar $4,000-$7,000; premium-brand $7,000-$10,000 (Haven of Heat, ThermalFinn)
- Indoor room/liner kit: $3,500-$12,000 (5x5 + 5kW ~$3,500-4,500; 8x8 + 9kW $7,000-9,000+)
- Infrared prefab cabin (shell+heater bundled): 1-2 person $1,000-$3,500; 3-4 person $3,000-$6,000; premium $3,000-$8,500

### B. Heater + stones
- Electric: $400-$3,000 (3 kW ~$754; 6-9 kW $850-$1,000; premium HUUM Drop/EOS $2,500-$3,500)
- Wood-burning: unit $800-$4,000; PLUS chimney/heat-shield install $2,500-$6,000 (2-3x electric install)
- Infrared: emitters bundled into cabin price (no separate heater line)
- Stones: $30-$80 (electric/wood only)
Heat-up: electric 25-50 min; wood 60-90 min; infrared 10-20 min.

### C. Electrical
Source: Backyard Sauna Pro, Sauna Guide electrical, Haven of Heat wiring.
- Traditional 240V circuit: $600-$1,800 (short <30 ft $600-$900; 30-60 ft $900-$1,300; long/underground $1,300-$2,000)
- Panel/service upgrade if needed: +$1,500-$3,000
- Outdoor trenching: +$200-$1,000 (manual to machine); often the largest single electrical line
- GFCI breaker: $80-$150 (usually included in labor)
- Infrared on standard 120V outlet: $0 (no electrician)
- Permit + inspection: $50-$500

### D. Foundation (outdoor only)
- Gravel pad / pavers: $200-$500
- Poured concrete slab (heavy permanent cabin): $600-$2,000

### E. Labor (build path)
- Full DIY: $0 labor (40-100+ hours of your time; intermediate-advanced carpentry)
- DIY shell + pro electrical: add only the electrical labor (already in C)
- Full carpenter/contractor: roughly DOUBLES the DIY total range (ThermalFinn). Kit assembly help alone: $200-$500.
- Accessories (backrest, bucket+ladle, thermometer, light): $100-$300

## Cross-check: scenario totals (validate calculator output against these)
- Indoor conversion: DIY $2,000-$4,500 | contractor $5,000-$10,000
- Barrel kit: DIY $3,000-$7,000 | contractor $5,000-$10,000
- Outdoor cabin: DIY $5,000-$12,000 | contractor $12,000-$25,000
- Premium backyard build (Home Made Sauna worked example): materials $6,800-$12,400 + electrical $2,000-$5,000 = $8,800-$17,400
- Infrared prefab (plug-in): $1,000-$8,500 all-in, often $0 electrical

## Operating cost (show as a secondary output)
- Traditional electric: ~$15-$30/month at 3-5x/week; ~$2-$4/session (6-9 kW)
- Infrared: ~$5-$15/month; ~$0.20-$1.50/session
- Wood-burning: ~$3-$8/session in purchased firewood (near-zero if self-sourced)
Assumes ~$0.16/kWh; let the user override the rate.

## Suggested compute logic (pseudocode)
```
base = shell_cost[size][tier][technology]      // low-high pair
heater = heater_cost[technology][size]          // 0 for infrared (bundled)
stones = technology in (electric,wood) ? 30..80 : 0
electrical =
  technology == infrared ? 0
  : circuit_cost[run_length]
    + (needs_panel_upgrade ? 1500..3000 : 0)
    + (location == outdoor ? trenching 200..1000 : 0)
    + permit 50..500
foundation = location == outdoor ? (tier==premium ? slab 600..2000 : gravel 200..500) : 0
labor =
  build_path == diy ? 0
  : build_path == diy_plus_electrical ? 0   // electrical already counted
  : contractor ? (shell+heater) * (1.0..1.5)   // roughly doubles total
accessories = 100..300
total_low  = sum of all .low
total_high = sum of all .high
```
Clamp/sanity-check the total against the scenario table above; if it drifts far outside, the presets need adjusting. Always output a RANGE, never a single number.

## On-page requirements (E-E-A-T)
- Disclaimer: "Estimate only. Real costs vary by region, panel capacity, material prices, and labor rates. Get a written quote from a licensed electrician before buying a heater."
- Show the itemized breakdown and the assumptions (size->kW, run length, etc.).
- Link out to the electrical guide and the best-home-sauna page.
- No fabricated 'we built this' claims; the tool is a synthesis estimator.

## Sources
- Sauna Guide - DIY vs Kit vs Pre-Built: https://sauna.guide/guides/diy-sauna-vs-kit-vs-prebuilt
- Sauna Guide - electrical planning: https://sauna.guide/guides/sauna-electrical-planning-guide
- Sauna Guide - electrical cost by state: https://sauna.guide/guides/sauna-electrical-cost-by-state-us
- ThermalFinn - cost breakdown: https://thermalfinn.com/sauna-builds/sauna-cost-breakdown/
- ThermalFinn - build guide / sizing + wood: https://thermalfinn.com/sauna-builds/
- ThermalFinn - wood vs electric heater: https://thermalfinn.com/sauna-heaters/wood-burning-vs-electric/
- Haven of Heat - 2026 pricing: https://havenofheat.com/blogs/sauna-guides/how-much-does-a-sauna-cost-the-complete-2026-pricing-guide
- Haven of Heat - electrical wiring: https://havenofheat.com/blogs/sauna-guides/sauna-electrical-requirements-complete-wiring-guide-240v-vs-120v-breaker-sizing-wire-gauge
- Haven of Heat - sizing: https://havenofheat.com/blogs/sauna-guides/how-to-size-a-sauna-why-person-capacity-is-misleading
- Home Made Sauna - backyard build breakdown: https://homemadesauna.com/blogs/news/how-much-does-it-cost-to-build-a-backyard-sauna-2026
- Peak Primal Wellness - budget DIY: https://peakprimalwellness.com/blogs/wellness/how-to-build-a-sauna-cheap
- The Sauna Place - 2026 pricing: https://www.saunaplace.com/blogs/blogs/how-much-does-a-sauna-cost
- SaunaKits - heater prices: https://saunakits.com/blogs/news/how-much-is-a-sauna-heater
- Tahoe Sauna Company - heater buying guide: https://tahoesaunacompany.com/best-sauna-heater-buying-guide
- Backyard Sauna Pro - electrical requirements: https://backyardsaunapro.com/guides/sauna-electrical-requirements/
- Sweat Decks - sizing + heater calculator: https://sweatdecks.com/blogs/news/sauna-sizing
- Cost to Renovate - 2026 home sauna cost: https://www.costtorenovate.com/blog/home-sauna-cost-2026/
