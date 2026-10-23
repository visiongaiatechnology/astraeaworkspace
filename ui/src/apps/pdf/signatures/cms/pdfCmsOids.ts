// STATUS: PLATIN
// OID assignments used by the supported CMS and RFC 3161 subset.

export const CmsOid = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  signatureTimeStampToken: '1.2.840.113549.1.9.16.2.14',
  timestampInfoContentType: '1.2.840.113549.1.9.16.1.4',
  sha256: '2.16.840.1.101.3.4.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRsaEncryption: '1.2.840.113549.1.1.11',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
} as const;
