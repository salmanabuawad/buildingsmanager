#!/usr/bin/env bash
#
# Generate a fresh internal CA + server certificate for the internal host
# profile-group.co.il (10.25.236.179) and wire nginx to use it.
#
# Produces:
#   /etc/ssl/buildingsmanager/fullchain.pem               (server cert + CA chain)
#   /etc/ssl/buildingsmanager/privkey.pem                 (server private key, 0600)
#   /etc/ssl/buildingsmanager/ca.key                      (CA private key, 0600 — keep!)
#   /etc/ssl/buildingsmanager/profile-group-internal-ca.crt  (CA ROOT to install on clients)
#
# SANs on the server cert:
#   DNS:profile-group.co.il, DNS:www.profile-group.co.il, IP:10.25.236.179
#
# Validity: CA = 10 years, server leaf = 5 years (internal, no auto-renew needed).
#
# HOW TO RUN (as root, on the LAN box):
#   sudo bash /tmp/gen-internal-cert-lan.sh
#
# Idempotent-ish: backs up any existing cert/key before overwriting. Re-running
# regenerates BOTH the CA and the leaf (so you'd need to re-distribute the root).
# To only re-issue the leaf later (keeping the same CA/root), use the
# REISSUE_LEAF_ONLY=1 env var:
#   sudo REISSUE_LEAF_ONLY=1 bash /tmp/gen-internal-cert-lan.sh

set -euo pipefail

CERT_DIR="/etc/ssl/buildingsmanager"
CA_DAYS=3650
LEAF_DAYS=1825
TS="$(date +%Y%m%d-%H%M%S)"
REISSUE_LEAF_ONLY="${REISSUE_LEAF_ONLY:-0}"

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: must run as root (use: sudo bash $0)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# SAN extension config shared by CSR and signing.
cat > san.cnf <<'EOF'
[req]
distinguished_name = dn
req_extensions = v3_req
prompt = no
[dn]
C = IL
O = Profile Group
CN = profile-group.co.il
[v3_req]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = profile-group.co.il
DNS.2 = www.profile-group.co.il
IP.1  = 10.25.236.179
EOF

# Signing extensions (read from default section by `openssl x509 -extfile`).
cat > ext.cnf <<'EOF'
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = profile-group.co.il
DNS.2 = www.profile-group.co.il
IP.1  = 10.25.236.179
EOF

mkdir -p "$CERT_DIR"

if [ "$REISSUE_LEAF_ONLY" = "1" ]; then
  echo "=== Reusing existing CA at $CERT_DIR/ca.key + profile-group-internal-ca.crt ==="
  [ -f "$CERT_DIR/ca.key" ] && [ -f "$CERT_DIR/profile-group-internal-ca.crt" ] || {
    echo "ERROR: REISSUE_LEAF_ONLY=1 but CA files not found in $CERT_DIR" >&2; exit 1; }
  cp "$CERT_DIR/ca.key" ca.key
  cp "$CERT_DIR/profile-group-internal-ca.crt" ca.crt
else
  echo "=== [1/4] Generating internal CA (10y) ==="
  openssl genrsa -out ca.key 4096
  openssl req -x509 -new -nodes -key ca.key -sha256 -days "$CA_DAYS" \
    -subj "/C=IL/O=Profile Group/CN=Profile Group Internal CA" \
    -out ca.crt
fi

echo "=== [2/4] Generating server key + CSR (SANs: domain, www, IP) ==="
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -config san.cnf

echo "=== [3/4] Signing server cert with CA (5y) ==="
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "$LEAF_DAYS" -sha256 -extfile ext.cnf

echo "=== [4/4] Installing into $CERT_DIR + reloading nginx ==="
# Back up whatever is there now.
for f in fullchain.pem privkey.pem profile-group-internal-ca.crt ca.key; do
  [ -f "$CERT_DIR/$f" ] && cp -a "$CERT_DIR/$f" "$CERT_DIR/$f.bak.$TS"
done

cat server.crt ca.crt > "$CERT_DIR/fullchain.pem"
cp server.key "$CERT_DIR/privkey.pem"
cp ca.crt    "$CERT_DIR/profile-group-internal-ca.crt"
cp ca.key    "$CERT_DIR/ca.key"
chmod 600 "$CERT_DIR/privkey.pem" "$CERT_DIR/ca.key"
chmod 644 "$CERT_DIR/fullchain.pem" "$CERT_DIR/profile-group-internal-ca.crt"

nginx -t
systemctl reload nginx

echo
echo "=== Verifying installed server cert ==="
openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName
echo
echo "=== Local TLS handshake (chain) ==="
echo | openssl s_client -connect 127.0.0.1:443 -servername profile-group.co.il 2>/dev/null \
  | openssl x509 -noout -subject -issuer 2>/dev/null

cat <<EOF

==============================
  DONE.

  Server now serves a cert signed by your fresh internal CA.
  Backups (if any) saved with suffix .bak.${TS}

  >>> DISTRIBUTE THIS ROOT TO CLIENTS (so browsers trust the site):
        $CERT_DIR/profile-group-internal-ca.crt

  Install on Windows clients:
    - Domain-wide (recommended): GPO →
        Computer Config → Policies → Windows Settings → Security Settings →
        Public Key Policies → Trusted Root Certification Authorities → Import
    - Single machine: double-click the .crt →
        Install Certificate → Local Machine →
        "Place all certificates in the following store" →
        Trusted Root Certification Authorities

  Keep $CERT_DIR/ca.key PRIVATE (0600). To re-issue only the leaf later:
        sudo REISSUE_LEAF_ONLY=1 bash /tmp/gen-internal-cert-lan.sh
==============================
EOF
