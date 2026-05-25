#!/bin/bash
# certbot --manual-auth-hook for DNS-01.
# certbot sets CERTBOT_DOMAIN and CERTBOT_VALIDATION in the env.
# This prints the TXT record the user must create, records it to a file we
# can read out-of-band, then polls the AUTHORITATIVE nameserver until the
# record is live (so we don't depend on cache TTLs). Returns 0 when found.

REC="_acme-challenge.${CERTBOT_DOMAIN}"
VAL="${CERTBOT_VALIDATION}"
NEEDED="/tmp/le-dns-needed.txt"
AUTH_NS="ns1.jetdns.net"
MAX_TRIES=80      # 80 * 15s = 20 minutes
SLEEP=15

echo "ADD_TXT|${REC}|${VAL}" >> "$NEEDED"
chmod 644 "$NEEDED" 2>/dev/null || true

echo ">>> DNS-01 challenge for ${CERTBOT_DOMAIN}"
echo ">>> Create this DNS TXT record at JetServer:"
echo ">>>     Name : ${REC}"
echo ">>>     Value: ${VAL}"
echo ">>> Polling ${AUTH_NS} (up to 20 min) for the record to go live..."

for i in $(seq 1 "$MAX_TRIES"); do
  out="$(dig +short TXT "${REC}" "@${AUTH_NS}" 2>/dev/null | tr -d '"')"
  if echo "$out" | grep -qF "${VAL}"; then
    echo ">>> [$i] FOUND ${REC} at ${AUTH_NS}. Waiting 10s for consistency."
    sleep 10
    exit 0
  fi
  echo ">>> [$i] not live yet, retrying in ${SLEEP}s..."
  sleep "$SLEEP"
done

echo ">>> TIMEOUT: ${REC} never appeared at ${AUTH_NS}." >&2
exit 1
