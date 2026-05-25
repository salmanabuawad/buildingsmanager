#!/bin/bash
# certbot --manual-cleanup-hook for DNS-01.
# We can't auto-delete the TXT at JetServer (no API), so just record which
# records can be safely removed by hand afterwards.
REC="_acme-challenge.${CERTBOT_DOMAIN}"
echo "REMOVE_TXT|${REC}|${CERTBOT_VALIDATION:-}" >> /tmp/le-dns-cleanup.txt
echo ">>> (manual) You may delete TXT record ${REC} after issuance."
exit 0
