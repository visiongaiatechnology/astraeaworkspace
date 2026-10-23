# VGT Infinity Upstream Provenance

- Repository: `https://github.com/visiongaiatechnology/infinity.git`
- Pinned commit: `55b05a697a189d0ec583cdcf340beeba1efc9130`
- Suite: `VGT-INFINITY-1`
- Crypto integration: exact Cargo git dependency on `vgt-infinity-core`; Astraea does **not** copy or fork the Infinity cryptographic core.
- Provider algorithms: HQC-256 and AIGIS-ENC-4 remain the exact suite/provider choices of the pinned Infinity commit.
- Astraea mirrors only the provider protocol helper and adds boundary hardening: strict schema/size bounds, provider-only working directory, proxy-environment scrubbing, Python-level network construction denial and mutable input wiping. This does not redefine the suite.
- OS-enforced provider sandboxing / native-provider replacement remains a release assurance gate. It may strengthen isolation but may not silently change `VGT-INFINITY-1` algorithms or transcript semantics.
- Any upstream algorithm/order/domain/signature/format change requires a new Astraea Top Secret suite/format review and new fixed vectors.
