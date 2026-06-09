# 00 - Keyword Strategy

## Canonical data source

Use `data/discoveries-sauna-superexpanded.csv` as the primary keyword cluster file. It contains the broadest scan and includes volume, KD, CPC, monetisation proxy, trend, SERP openness, intent share, top-5 domains, composite score, and verdict.

Use `data/discoveries-sauna-expanded.csv` as a cross-check because it captures some adjacent opportunities more clearly, especially `barrel sauna` and `best red light therapy panel`.

## Core cluster priorities

| Cluster | Why it matters | First page type |
| --- | --- | --- |
| `home sauna` | 192,300 monthly searches, KD 1.9, rising, open SERP. This is the site umbrella. | Best/home buyer guide |
| `outdoor sauna` | 82,100 monthly searches, KD 2.0, rising. Strong high-ticket backyard intent. | Best outdoor sauna |
| `portable sauna` | 73,600 monthly searches, KD 0.0, CPC $4.21. Excellent renter/apartment fit. | Best portable sauna |
| `sauna heater` | 35,700 monthly searches, KD 2.5, CPC $4.48. Strong DIY buyer intent. | Best sauna heater |
| `infrared sauna benefits` | 35,200 monthly searches, KD 22.0. Informational demand but more health-sensitive. | Evidence-based guide |
| `portable infrared sauna` | 12,100 monthly searches, KD 0.0, rising. Product-specific sub-silo. | Best portable infrared sauna |
| `infrared sauna blanket` | 8,100 monthly searches, KD 0.0, rising. Lower-ticket affiliate entry point. | Best sauna blanket |
| `sauna kit` | 8,100 monthly searches, KD 0.0, rising. DIY kit opportunity. | Best sauna kit |
| `infrared sauna vs traditional sauna` | 6,600 monthly searches, 100% commercial intent share in scan. | Comparison guide |
| `outdoor infrared sauna` | 5,400 monthly searches, CPC $5.43. High-CPC sub-silo. | Best outdoor infrared sauna |

## Adjacent data to preserve

These topics came through the sauna data collection and should stay in the package.

| Topic | Source | Signal | Recommendation |
| --- | --- | --- | --- |
| Red light therapy at home | Curated seed set and editorial concept source | Strong buyer overlap with home recovery devices | Expansion mini-silo after core sauna pages |
| Best red light therapy panel | Expanded cluster output | 2,900 vol, KD 0.0, CPC $4.55, openness 1.00, GO, volume below floor | First red-light commercial page |
| Contrast therapy | Superexpanded and expanded outputs | 8,100 vol, KD 20.0, CPC $2.97, openness 1.00, GO | Bridge page between sauna and cold plunge |
| Sauna for muscle recovery | Superexpanded output | 9,900 vol, KD 2.0, CPC $4.03, falling trend | Support page, not first priority |
| Cold plunge tub / best cold plunge | Seed set and portable-sauna cluster contamination | Adjacent high-ticket category | Park until sauna topical base exists |

## Exclusions

Do not build around these as national affiliate pages:

- `q sauna and spa`
- `new york spa and sauna`
- `sauna public`
- Location-specific sauna venue queries unless the site later becomes a directory.

## Data quality notes

- Superexpanded is broader but noisy. Filter manually.
- Expanded is cleaner for some page concepts.
- The red light opportunity is real enough to preserve, but not strong enough from current files to become the primary site thesis.
- Stage B page mining has not been run for sauna. The page briefs are editorially derived from Stage A clusters, not from a dedicated `mine_pages.py` dossier.
