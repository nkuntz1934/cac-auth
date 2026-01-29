export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cf = request.cf || {};
    const tlsClientAuth = cf.tlsClientAuth || {};

    const certPresented = tlsClientAuth.certPresented === "1";
    const certVerified = tlsClientAuth.certVerified === "SUCCESS";

    // Service binding endpoint - just return auth status
    if (url.pathname === "/validate") {
      return new Response(JSON.stringify({ authenticated: certVerified }), {
        status: certVerified ? 200 : 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // API endpoint - return JSON
    if (url.pathname === "/api" || request.headers.get("Accept")?.includes("application/json")) {
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
    }

    // Browser request - return HTML
    return new Response(getHTML(certVerified, certPresented, tlsClientAuth), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

function getHTML(certVerified, certPresented, tlsClientAuth) {
  const statusIcon = certVerified ? '✓' : '✗';
  const statusColor = certVerified ? '#10b981' : '#ef4444';
  const statusText = certVerified ? 'Authenticated' : 'Not Authenticated';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DoD CAC Authentication Demo</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #0a0a0a;
            color: #e5e5e5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            min-height: 100vh;
            padding: 24px;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
        }

        header {
            text-align: center;
            padding: 48px 0;
            border-bottom: 1px solid #262626;
        }

        .logo {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
        }

        .logo svg {
            width: 40px;
            height: 40px;
        }

        h1 {
            color: #fff;
            font-size: 2rem;
            margin-bottom: 12px;
            font-weight: 600;
        }

        .subtitle {
            color: #a3a3a3;
            font-size: 1.1rem;
        }

        .status-card {
            background: linear-gradient(135deg, #1a1a1a 0%, #141414 100%);
            border: 1px solid ${statusColor};
            border-radius: 16px;
            padding: 32px;
            margin: 32px 0;
            box-shadow: 0 0 30px ${statusColor}33;
        }

        .status-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
        }

        .status-icon {
            width: 60px;
            height: 60px;
            background: ${statusColor};
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            font-weight: bold;
            color: white;
        }

        .status-text h2 {
            color: ${statusColor};
            font-size: 1.5rem;
            margin-bottom: 4px;
        }

        .status-text p {
            color: #737373;
            font-size: 0.9rem;
        }

        .cert-info {
            background: #1a1a1a;
            border: 1px solid #262626;
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
        }

        .cert-info h3 {
            color: #ff8c42;
            font-size: 1.1rem;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .cert-row {
            display: grid;
            grid-template-columns: 140px 1fr;
            padding: 12px 0;
            border-bottom: 1px solid #262626;
        }

        .cert-row:last-child {
            border-bottom: none;
        }

        .cert-label {
            color: #a3a3a3;
            font-size: 0.875rem;
            font-weight: 500;
        }

        .cert-value {
            color: #e5e5e5;
            font-size: 0.875rem;
            font-family: 'Courier New', monospace;
            word-break: break-all;
        }

        .info-section {
            background: #141414;
            border: 1px solid #262626;
            border-radius: 12px;
            padding: 32px;
            margin: 32px 0;
        }

        .info-section h3 {
            color: #fff;
            font-size: 1.3rem;
            margin-bottom: 20px;
        }

        .steps {
            list-style: none;
            counter-reset: step;
        }

        .steps li {
            counter-increment: step;
            padding: 16px 0 16px 48px;
            position: relative;
            color: #a3a3a3;
        }

        .steps li::before {
            content: counter(step);
            position: absolute;
            left: 0;
            top: 16px;
            width: 32px;
            height: 32px;
            background: #ff8c42;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 0.875rem;
        }

        .supported-cas {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
            margin-top: 20px;
        }

        .ca-badge {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
            color: #a3a3a3;
            font-size: 0.875rem;
            font-family: 'Courier New', monospace;
        }

        footer {
            text-align: center;
            padding: 32px 0;
            border-top: 1px solid #262626;
            margin-top: 48px;
            color: #666;
            font-size: 0.875rem;
        }

        footer a {
            color: #ff8c42;
            text-decoration: none;
        }

        footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 640px) {
            .cert-row {
                grid-template-columns: 1fr;
                gap: 4px;
            }

            .status-header {
                flex-direction: column;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="#ff8c42">
                    <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z"/>
                    <path d="M50 30 L70 42 L70 58 L50 70 L30 58 L30 42 Z" fill="#0a0a0a"/>
                </svg>
                <span style="font-size: 1.2rem; font-weight: 600; color: #ff8c42;">Cloudflare</span>
            </div>
            <h1>DoD CAC Authentication Demo</h1>
            <p class="subtitle">Secure mTLS authentication using Common Access Cards</p>
        </header>

        <div class="status-card">
            <div class="status-header">
                <div class="status-icon">${statusIcon}</div>
                <div class="status-text">
                    <h2>${statusText}</h2>
                    <p>${certVerified ? 'Your CAC certificate has been verified' : 'No valid CAC certificate detected'}</p>
                </div>
            </div>

            ${certPresented && certVerified ? `
            <div class="cert-info">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Certificate Details
                </h3>
                <div class="cert-row">
                    <div class="cert-label">Subject</div>
                    <div class="cert-value">${tlsClientAuth.certSubjectDN || 'N/A'}</div>
                </div>
                <div class="cert-row">
                    <div class="cert-label">Issuer</div>
                    <div class="cert-value">${tlsClientAuth.certIssuerDN || 'N/A'}</div>
                </div>
                <div class="cert-row">
                    <div class="cert-label">Serial</div>
                    <div class="cert-value">${tlsClientAuth.certSerial || 'N/A'}</div>
                </div>
                <div class="cert-row">
                    <div class="cert-label">Valid From</div>
                    <div class="cert-value">${tlsClientAuth.certNotBefore || 'N/A'}</div>
                </div>
                <div class="cert-row">
                    <div class="cert-label">Valid Until</div>
                    <div class="cert-value">${tlsClientAuth.certNotAfter || 'N/A'}</div>
                </div>
                <div class="cert-row">
                    <div class="cert-label">SHA-256</div>
                    <div class="cert-value">${tlsClientAuth.certFingerprintSHA256 || 'N/A'}</div>
                </div>
            </div>
            ` : ''}
        </div>

        <div class="info-section">
            <h3>How It Works</h3>
            <ol class="steps">
                <li><strong>Certificate Upload:</strong> DoD Root CA 6 and all intermediate CAs (70-79) are uploaded to Cloudflare as a trusted CA bundle</li>
                <li><strong>mTLS Handshake:</strong> When you connect, Cloudflare requests a client certificate signed by one of these trusted CAs</li>
                <li><strong>Validation:</strong> Cloudflare validates the full certificate chain against the uploaded CA bundle</li>
                <li><strong>Authentication:</strong> If valid, your certificate details are passed to the Worker for processing</li>
            </ol>
        </div>

        <div class="info-section">
            <h3>Supported Certificate Authorities</h3>
            <div class="supported-cas">
                <div class="ca-badge">DoD Root CA 6</div>
                <div class="ca-badge">DOD ID CA-70</div>
                <div class="ca-badge">DOD ID CA-71</div>
                <div class="ca-badge">DOD ID CA-72</div>
                <div class="ca-badge">DOD ID CA-73</div>
                <div class="ca-badge">DOD ID CA-78</div>
                <div class="ca-badge">DOD ID CA-79</div>
            </div>
        </div>

        <footer>
            <p>Powered by Cloudflare Workers and mTLS</p>
            <p><a href="https://github.com/SilentHeroes/cac-auth" target="_blank">View on GitHub</a></p>
        </footer>
    </div>
</body>
</html>`;
}
