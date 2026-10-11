# Draft land-use layer from the 2030 PDF

Rebuilds `public/data/features.geojson` and `public/data/legend_shares.json` from the vector
drawing in `TP THANH HOA 2030.pdf` (kept in the `VietUrban` workspace, folder `TP THANH HOA`,
not in this repo). Needs Node 24. No PDF library: the scripts read the content stream directly.

Re-running the steps below from these scripts reproduces the committed `features.geojson` byte for byte.

## Steps

1. Extract legend-coloured shapes and grid lines (page coordinates, PDF points):
   `node scripts/draft-from-pdf/extract-vector.cjs <path to>/TP THANH HOA 2030.pdf <tmp>/vector2030.json`
2. Georeference and convert to lon/lat (VN-2000 TM, from the sheet's grid labels):
   `node scripts/draft-from-pdf/build-candidate.cjs <tmp>/vector2030.json none <tmp>/candidate.geojson`
3. Write the app schema and the legend shares (about a minute):
   `node scripts/draft-from-pdf/to-app-features.cjs <tmp>/candidate.geojson src/taxonomy.ts public/data/ward_boundary.geojson public/data/features.geojson`
4. Check: `node scripts/draft-from-pdf/check-candidate.cjs public/data/features.geojson`
5. Validate: `npm run validate-data`

## Georeference (hard-coded in build-candidate.cjs)

- Easting 574 km at the first vertical grid line, +2 km per line (labels read by OCR from the bottom margin).
- Northing 2180 km at the lowest horizontal grid line, +2 km per line (labels from the left and right margins).
- Projection: VN-2000 TM, central meridian 105, k0 0.9999, false easting 500000, GRS80.

Not checked against ground truth. A surveyor check is still required (SPEC section 9).

## Known limits

- Only fills with an exact legend colour are used. Roads, text and symbols are excluded.
- Holes are handled by nesting depth; a ring nested in another same-path ring becomes a hole.
- `accuracy_m` is left null because no RMSE exists yet.
