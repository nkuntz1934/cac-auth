export default {
  async fetch(request) {
    const cf = request.cf || {};
    const tlsClientAuth = cf.tlsClientAuth || {};

    const certPresented = tlsClientAuth.certPresented === "1";
    const certVerified = tlsClientAuth.certVerified === "SUCCESS";

    // Custom validation for DoD CAC certificates
    const trustedIssuers = [
      "CN=DOD ID CA-70",
      "CN=DOD ID CA-71",
      "CN=DOD ID CA-72",
      "CN=DOD ID CA-73",
      "CN=DOD ID CA-78",
      "CN=DOD ID CA-79"
    ];

    const issuer = tlsClientAuth.certIssuerDN || "";
    const issuedByTrustedCA = trustedIssuers.some(ca => issuer.includes(ca));

    // Check if certificate is not expired
    const notAfter = tlsClientAuth.certNotAfter ? new Date(tlsClientAuth.certNotAfter) : null;
    const notExpired = notAfter ? notAfter > new Date() : false;

    // Custom authentication: cert presented + issued by trusted DoD CA + not expired
    const customAuthenticated = certPresented && issuedByTrustedCA && notExpired;

    const response = {
      authenticated: customAuthenticated,
      cloudflareVerified: certVerified,
      certificate: certPresented ? {
        verified: certVerified,
        customVerified: customAuthenticated,
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
      status: customAuthenticated ? 200 : 401,
      headers: { "Content-Type": "application/json" },
    });
  },
};
