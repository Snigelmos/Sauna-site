# Sauna Site Handover

This folder is the build handover for a new sauna affiliate site. It is meant for a future chat or builder to open first, understand the SEO opportunity, and start building without needing the original research conversation.

## One-line recommendation

Build a home-sauna affiliate authority site first. The strongest opportunity is not a local sauna finder; it is a buyer-focused site that helps people choose between home sauna formats: indoor infrared cabins, outdoor/barrel saunas, portable saunas, sauna blankets, heaters, kits, and recovery-adjacent products.

## Source data in this package

All copied data is in `data/`:

- `discoveries-sauna-superexpanded.csv`: canonical cluster output. Use this first.
- `discoveries-sauna-expanded.csv`: cross-check output. Important for `barrel sauna` and `best red light therapy panel`.
- `discoveries-sauna.csv`: legacy baseline. Reference only because it contains KD placeholder issues.
- `sauna-superexpanded-seeds.txt`: broad DataForSEO-expanded seed list.
- `sauna-expanded-seeds.txt`: curated seed list with sauna, red light therapy, contrast therapy, and cold plunge terms.
- `sauna-seeds.txt`: original smaller seed list.
- `adjacent-clusters-summary.csv`: extracted summary for red light therapy, contrast therapy, and recovery adjacencies.
- `adjacent-keywords-red-light-contrast-cold-plunge.txt`: adjacency seed terms worth preserving.

## Keyword opportunity snapshot

| Priority | Cluster | Monthly volume | KD avg | CPC avg | SERP openness | Verdict | Role |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | home sauna | 192,300 | 1.9 | $3.75 | 1.00 | GO | Main umbrella hub |
| 2 | outdoor sauna | 82,100 | 2.0 | $2.07 | 1.00 | GO | High-ticket backyard pillar |
| 3 | portable sauna | 73,600 | 0.0 | $4.21 | 1.00 | GO | Apartment/renter pillar |
| 4 | sauna heater | 35,700 | 2.5 | $4.48 | 1.00 | GO | DIY/build pillar |
| 5 | infrared sauna benefits | 35,200 | 22.0 | $1.71 | 1.00 | GO | Informational support, health caution |
| 6 | portable infrared sauna | 12,100 | 0.0 | $3.97 | 1.00 | GO | Product sub-silo |
| 7 | infrared sauna blanket | 8,100 | 0.0 | $2.94 | 1.00 | GO | Entry-tier product sub-silo |
| 8 | sauna kit | 8,100 | 0.0 | $2.83 | 1.00 | GO | DIY sub-silo |
| 9 | infrared sauna vs traditional sauna | 6,600 | 0.0 | $2.33 | 1.00 | GO | Comparison page |
| 10 | outdoor infrared sauna | 5,400 | 0.0 | $5.43 | 1.00 | GO | High-CPC outdoor sub-silo |

## Red light therapy and recovery adjacency

Keep the red light data in the package. It should not replace the home-sauna thesis, but it is a useful expansion lane because the same buyer is often interested in at-home recovery devices.

Collected signals:

- `best red light therapy panel`: 2,900 monthly volume, KD 0.0, CPC $4.55, SERP openness 1.00, GO, but below the default volume floor.
- `red light therapy at home`: captured in the curated seed set and editorial concepts as a larger adjacent opportunity. Treat as a follow-up research target before making it a full pillar.
- `contrast therapy`: 8,100 monthly volume, KD 20.0, CPC $2.97, SERP openness 1.00, GO.
- `sauna for muscle recovery`: 9,900 monthly volume, KD 2.0, CPC $4.03, SERP openness 1.00, GO, but falling trend.
- `cold plunge tub` and `best cold plunge`: present in the seed set and partially contaminating the portable sauna cluster. Useful for later recovery expansion, not for day-one site positioning.

Recommended handling: create one red light therapy page after the core sauna pillars are live, then decide whether to expand it into a mini-silo based on updated keyword data and affiliate access.

## Build order

1. Build `best home sauna` as the umbrella commercial page.
2. Build `best outdoor sauna` and `best barrel sauna` for high-ticket backyard buyers.
3. Build `best portable sauna` and `best sauna blanket` for apartment/renter buyers.
4. Build `best sauna heater` and `best sauna kit` for DIY buyers.
5. Add comparison and support content: `infrared sauna vs traditional sauna`, `sauna temperature`, `infrared sauna benefits`.
6. Add adjacency pages: `contrast therapy at home`, `red light therapy at home`, and eventually cold plunge content if affiliate fit is strong.

## Important caveats

- Use `discoveries-sauna-superexpanded.csv` as canonical.
- Use `discoveries-sauna-expanded.csv` to preserve `barrel sauna` and red light therapy signals.
- The legacy `discoveries-sauna.csv` has `KD_UNKNOWN` style placeholders and should not drive decisions.
- Some seed and cluster data contains local, branded, or off-topic terms. Filter local spa queries out of the national affiliate plan.
- Do not fabricate testing, medical claims, first-hand ownership, expert review, or product ratings.
- Sauna benefits, detox, weight loss, cardiovascular, inflammation, and red light therapy pages need careful sourcing and conservative claims.

## Files to read next

1. `00-keyword-strategy.md`
2. `01-site-positioning.md`
3. `02-site-architecture.md`
4. `03-publish-roadmap.md`
5. `04-monetization-and-eeat.md`
6. The briefs in `briefs/`
