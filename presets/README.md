# Presets

A preset is a pair of `categories.yml` and `feeds.yml` files stored under `presets/<name>/`.

The engine resolves `PRESET=<name>` automatically. You can still override either file with `CATEGORIES_FILE` or `FEEDS_FILE` in `.env`.

Official presets:

- `br` — Vanilla/Brazil-first, the default.
- `global` — a mixed Brazilian + international source set.

Country-specific presets are intentionally community-friendly: copy `presets/br` or `presets/global`, replace the RSS/Atom sources with local publishers, and set `LANGUAGE`, `EDITORIAL_CONTEXT` and `TIME_ZONE` in `.env`. Pull requests adding well-maintained regional presets are welcome.
