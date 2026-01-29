# DoD CAC Authentication for Cloudflare Workers

Enable DoD Common Access Card (CAC) authentication using Cloudflare Workers with mTLS and Bring Your Own CA (BYOCA).

## How mTLS Works

Mutual TLS (mTLS) provides two-way certificate authentication:

1. The server (Cloudflare) presents its certificate to the client (browser)
2. The client (browser) presents its certificate (CAC) back to the server
3. Both sides validate each other's certificates

In this implementation:
- Cloudflare requests a client certificate when accessing the configured hostname
- The browser presents the DoD CAC certificate
- Cloudflare validates the CAC against the uploaded CA bundle (Root CA 6 + intermediate CAs)
- Cloudflare passes the validation result to the Worker
- The Worker returns the authenticated certificate details

The mTLS handshake happens at the Cloudflare edge before the request reaches the Worker.

## Prerequisites

- Cloudflare Enterprise account (required for BYOCA/mTLS)
- Wrangler CLI installed and authenticated
- Domain on Cloudflare
- API token with permissions:
  - Account → SSL and Certificates → Edit
  - Zone → SSL and Certificates → Edit
  - Workers Scripts → Edit

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/SilentHeroes/cac-auth.git
cd cac-auth
```

### 2. Download DoD CA Certificates

Download all DoD intermediate CA certificates (CA-70 through CA-79) and Root CA 6:

```bash
# Download intermediate CAs
for ca in 70 71 72 73 78 79; do
  curl -o DODIDCA_${ca}.cer "http://crl.disa.mil/sign/DODIDCA_${ca}.cer"
  openssl x509 -in DODIDCA_${ca}.cer -inform DER -out DODIDCA_${ca}.pem -outform PEM
done

# Download all DoD CAs including Root CA 6
curl -s "https://raw.githubusercontent.com/erdc/dodcerts/master/dodcerts/dod-ca-certs.pem" -o all_dod_cas.pem

# Extract Root CA 6
python3 << 'EOF'
import re, subprocess
with open('all_dod_cas.pem', 'r') as f:
    certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', f.read(), re.DOTALL)
for cert in certs:
    proc = subprocess.run(['openssl', 'x509', '-noout', '-subject'], input=cert.encode(), capture_output=True)
    if b'DoD Root CA 6' in proc.stdout:
        with open('DODROOTCA6.pem', 'w') as out:
            out.write(cert + '\n')
        break
EOF

# Create complete bundle (Root CA 6 first, then all intermediate CAs)
cat DODROOTCA6.pem DODIDCA_70.pem DODIDCA_71.pem DODIDCA_72.pem DODIDCA_73.pem DODIDCA_78.pem DODIDCA_79.pem > dod_complete_ca_bundle.pem
```

### 3. Get Your Account ID

```bash
wrangler whoami
```

Note the Account ID for your account.

### 4. Set Environment Variables

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
```

### 5. Upload CA Bundle to Cloudflare

```bash
CERT_CONTENT=$(cat dod_complete_ca_bundle.pem | awk '{printf "%s\\n", $0}')

curl "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/mtls_certificates" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -d "{
    \"ca\": true,
    \"certificates\": \"${CERT_CONTENT}\",
    \"name\": \"DoD Root CA 6 + All Intermediate CAs (70-79)\"
  }"
```

Save the returned certificate ID from the response.

### 6. Associate Certificate with Hostname

```bash
CERT_ID="certificate-id-from-step-5"

curl -X PUT "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/certificate_authorities/hostname_associations" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostnames\": [\"cac.yourdomain.com\"],
    \"mtls_certificate_id\": \"${CERT_ID}\"
  }"
```

Note: BYOCA hostname associations are API-only and will not appear in the Cloudflare dashboard. No additional dashboard configuration is required.

### 7. Configure Worker

Edit `wrangler.jsonc` to update the hostname pattern:

```jsonc
{
  "name": "cac-auth",
  "main": "index.js",
  "compatibility_date": "2025-01-01",
  "routes": [
    {
      "pattern": "cac.yourdomain.com",
      "custom_domain": true
    }
  ]
}
```

Note: The `account_id` field is optional when using the `CLOUDFLARE_ACCOUNT_ID` environment variable.

### 8. Deploy Worker

```bash
wrangler deploy
```

## Testing

Access your CAC-enabled URL in a browser with your CAC inserted. Make sure your VPN is disabled.

Visit: `https://cac.yourdomain.com`

The browser will display an HTML page showing your authentication status and certificate details.

To get JSON response, visit: `https://cac.yourdomain.com/api`

Expected JSON response with valid CAC:

```json
{
  "authenticated": true,
  "certificate": {
    "verified": true,
    "subject": "CN=DOE.JOHN.1234567890,OU=USA,OU=PKI,OU=DoD,O=U.S. Government,C=US",
    "issuer": "CN=DOD ID CA-70,OU=PKI,OU=DoD,O=U.S. Government,C=US",
    "serial": "...",
    "notBefore": "...",
    "notAfter": "...",
    "fingerprint": {
      "sha1": "...",
      "sha256": "..."
    }
  }
}
```

## Adding Additional Hostnames

To add CAC authentication to another hostname in the same zone:

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/certificate_authorities/hostname_associations" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostnames\": [\"cac.yourdomain.com\", \"api.yourdomain.com\"],
    \"mtls_certificate_id\": \"${CERT_ID}\"
  }"
```

Then add the route to `wrangler.jsonc` and redeploy.

## Adding to Other Zones

To deploy CAC authentication to a different Cloudflare zone (different domain):

### 1. Get the Zone ID for the new domain

```bash
curl -X GET "https://api.cloudflare.com/client/v4/zones?name=newdomain.com" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json"
```

### 2. Associate the CA bundle with the new zone's hostname

The CA bundle is uploaded at the account level and can be reused across multiple zones:

```bash
NEW_ZONE_ID="new-zone-id"

curl -X PUT "https://api.cloudflare.com/client/v4/zones/${NEW_ZONE_ID}/certificate_authorities/hostname_associations" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostnames\": [\"cac.newdomain.com\"],
    \"mtls_certificate_id\": \"${CERT_ID}\"
  }"
```

### 3. Update wrangler.jsonc

Add the new domain to the routes array:

```jsonc
{
  "name": "cac-auth",
  "main": "index.js",
  "compatibility_date": "2025-01-01",
  "routes": [
    {
      "pattern": "cac.yourdomain.com",
      "custom_domain": true
    },
    {
      "pattern": "cac.newdomain.com",
      "custom_domain": true
    }
  ]
}
```

### 4. Deploy

```bash
wrangler deploy
```

The same Worker will now handle CAC authentication for both domains.

## How It Works

1. **Certificate Upload**: DoD Root CA 6 and all intermediate CAs are uploaded to Cloudflare as a trusted CA bundle
2. **Hostname Association**: Specific hostnames are configured to request client certificates signed by these CAs
3. **Worker Validation**: Cloudflare validates the full certificate chain against the uploaded CA bundle
4. **Response**: Returns authenticated user information from the CAC certificate

## Important Notes

- Enterprise Cloudflare account required for BYOCA/mTLS
- Maximum 5 CA certificates per account
- Certificate chain must include Root CA 6 for proper validation
- Supports all DoD ID CAs: 70, 71, 72, 73, 78, 79
- No CRL checking is performed by Cloudflare

## Troubleshooting

**Certificate not verified**: Ensure the complete bundle (root + intermediate CAs) was uploaded and properly associated with the hostname.

**Browser doesn't prompt for certificate**: Check that the hostname association is active and mTLS is properly configured.

**401 Unauthorized**: Certificate may be expired, not issued by a trusted DoD CA, or CAC middleware may not be running.

**VPN interference**: Many VPNs perform SSL inspection which breaks client certificate authentication. Disable VPN when testing CAC authentication.

## References

- [Cloudflare BYOCA Documentation](https://developers.cloudflare.com/ssl/client-certificates/byo-ca/)
- [DoD PKI Certificate Repository](https://public.cyber.mil/pki-pke/)
- [DoD CA Certificates (GitHub)](https://github.com/erdc/dodcerts)

## License

MIT
