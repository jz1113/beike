# Source cleanup checks

Run from the repository root with the supported Node version:

- `npm run audit:source`: writes `.local/source-audit.json`. Counts physical source lines separately from tests and reports static import candidates. It never deletes files. Review nonliteral loading, package consumers and runtime registration before treating a candidate as unused.
- `npm run lint:unused`: compares ESLint unused-binding diagnostics against `works/configs/unused-baseline.json`. New diagnostics fail, removed diagnostics pass. Both `npm run check` and `npm run lint:gate` include this check.

The unused baseline records reviewed residual diagnostics, not permanent exemptions. Each entry is matched by exact path and diagnostic message with an occurrence limit. Do not automatically expand the baseline when a check fails. Remove a stale entry when its code is cleaned; add an entry only with a concrete reason after review.

Source scanning excludes dependencies, generated bundles, desktop resources/targets, docs and media. `.d.ts` files are counted but not flagged as runtime candidates. Package entry points are recognized. The scanner does not attempt symbol-level tree shaking, runtime profiling, or a precise duplicate-code percentage.
