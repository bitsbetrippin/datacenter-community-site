# Pull Request

## What changed

## Checklist (the site's integrity gate)

- [ ] `node scripts/validate-content.mjs` passes
- [ ] `npm run build` passes
- [ ] No em/en dashes introduced: `grep -rn "—\|–" src/` is clean
- [ ] Any new statistic has a fact record with a live URL and honest caveats
- [ ] Industry claims labeled company-reported; projections labeled modeled
- [ ] Attribution headers and the AI transparency notice untouched
