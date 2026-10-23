# Vendored PDF.js worker

- Version: Mozilla PDF.js `5.5.207`
- Upstream license: Apache-2.0 (license notice is embedded in `pdf.worker.min.mjs`)
- Source supplied for this Astraea checkpoint by the project owner as `1pdf.worker.min`; the runtime mount exposed the same bytes as `pdf.worker.min.mjs`.
- Worker SHA-256: `a8d200fdf60c66446a5ad28ee255400108a7cb57787d0a0d81a6063056824269`
- `.vendor/pdfjs-dist/pdf.worker.min.mjs` and `ui/public/vendor/pdfjs/pdf.worker.min.mjs` must remain byte-identical.
- `pdf.worker.bootstrap.mjs` is Astraea-owned compatibility glue. It only supplies missing modern JavaScript standard helpers before importing the unchanged upstream worker.
- Worker-side external CMap, standard-font, WASM and image fetch callbacks are denied by the Astraea client. Foreign PDF bytes are passed locally after the hostile-import boundary.
- The matching PDF.js display module is not vendored in this checkpoint; renderer-dependent Section-1 gates remain open.
