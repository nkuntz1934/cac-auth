#!/bin/bash
# Setup DoD mTLS for Cloudflare Workers
# Usage: ./setup-dod-mtls.sh <ca-certificate.pem> <hostname>

set -euo pipefail

PEM_FILE="${1:-}"
HOSTNAME="${2:-}"

# Validate inputs
if [[ -z "$PEM_FILE" || -z "$HOSTNAME" ]]; then
  echo "Usage: $0 <ca-certificate.pem> <hostname>"
  echo "Example: $0 dod_id_ca_72.pem cac.example.com"
  exit 1
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${CLOUDFLARE_ZONE_ID:-}" || -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: Set environment variables first:"
  echo "  export CLOUDFLARE_ACCOUNT_ID='...'"
  echo "  export CLOUDFLARE_ZONE_ID='...'"
  echo "  export CLOUDFLARE_API_TOKEN='...'"
  exit 1
fi

if [[ ! -f "$PEM_FILE" ]]; then
  echo "Error: File not found: $PEM_FILE"
  exit 1
fi

API="https://api.cloudflare.com/client/v4"

# Get certificate name from subject
CERT_NAME=$(openssl x509 -in "$PEM_FILE" -noout -subject 2>/dev/null | sed 's/.*CN *= *//' | cut -d',' -f1)
[[ -z "$CERT_NAME" ]] && CERT_NAME="DoD-CA"

echo "Uploading: $CERT_NAME"

# Format certificate for JSON
CERT_CONTENT=$(awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' "$PEM_FILE" | awk '{printf "%s\\n", $0}')

# Upload certificate (account-level)
RESPONSE=$(curl -s -X POST "$API/accounts/${CLOUDFLARE_ACCOUNT_ID}/mtls_certificates" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"ca\":true,\"certificates\":\"${CERT_CONTENT}\",\"name\":\"${CERT_NAME}\"}")

if ! echo "$RESPONSE" | grep -q '"success":true'; then
  echo "Error uploading certificate:"
  echo "$RESPONSE" | grep -o '"message":"[^"]*"' || echo "$RESPONSE"
  exit 1
fi

CERT_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Certificate ID: $CERT_ID"

# Associate hostname (zone-level)
echo "Associating hostname: $HOSTNAME"

RESPONSE=$(curl -s -X PUT "$API/zones/${CLOUDFLARE_ZONE_ID}/certificate_authorities/hostname_associations" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"hostnames\":[\"${HOSTNAME}\"],\"mtls_certificate_id\":\"${CERT_ID}\"}")

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "Success!"
  echo ""
  echo "Next steps:"
  echo "1. Enable mTLS in dashboard: SSL/TLS → Client Certificates → Hosts → Add '$HOSTNAME'"
  echo "2. Deploy the example worker: wrangler deploy"
else
  echo "Error associating hostname:"
  echo "$RESPONSE" | grep -o '"message":"[^"]*"' || echo "$RESPONSE"
  exit 1
fi
