export default {
  async fetch(request) {
    const cf = request.cf || {};
    const tlsClientAuth = cf.tlsClientAuth || {};

    const certPresented = tlsClientAuth.certPresented === "1";
    const certVerified = tlsClientAuth.certVerified === "SUCCESS";

    const response = {
      authenticated: certVerified,
      certificate: certPresented ? {
        verified: certVerified,
        subject: tlsClientAuth.certSubjectDN,
        issuer: tlsClientAuth.certIssuerDN,
        serial: tlsClientAuth.certSerial,
        notBefore: tlsClientAuth.certNotBefore,
        notAfter: tlsClientAuth.certNotAfter,
        fingerprint: {
          sha1: tlsClientAuth.certFingerprintSHA1,
          sha256: tlsClientAuth.certFingerprintSHA256,
        },
      } : null,
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: certVerified ? 200 : 401,
      headers: { "Content-Type": "application/json" },
    });
  },
};
