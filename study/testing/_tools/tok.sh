#!/bin/bash
# Usage: TOKEN=$(bash study/testing/_tools/tok.sh accountant1)  |  ... owner
set -e
E=/Users/hus3ain/Development/Zerupt/erp/.env
SU=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' $E | cut -d= -f2- | tr -d '"'"'")
SK=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' $E | cut -d= -f2- | tr -d '"'"'")
case "${1:-accountant1}" in
  owner) EMAIL="anonymator8@gmail.com"; PASS="Dev.zerupt.com@53";;
  *) EMAIL="$1@gulf-auto-parts-mt5kya1i.zerupt.local"; PASS="Zerupt.Test@2026";;
esac
curl -s "$SU/auth/v1/token?grant_type=password" -H "apikey: $SK" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token") or "ERR:"+json.dumps(d))'
