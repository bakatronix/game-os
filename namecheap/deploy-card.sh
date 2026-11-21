#!/usr/bin/env bash
# Upload the visiting-card page (namecheap/card/) to llamagriffin.com/card/
# on the Namecheap host over FTPS. The password is asked for at run time and
# never stored. Override host/user with FTP_HOST / FTP_USER if needed.
set -euo pipefail
cd "$(dirname "$0")/card"

HOST="${FTP_HOST:-68.65.120.165}"
USER_NAME="${FTP_USER:-$(git config user.email)}"
if [ -z "${FTP_PASSWORD:-}" ]; then
  read -r -s -p "FTP password for $USER_NAME: " FTP_PASSWORD; echo
fi

# Pass credentials via a temporary netrc so they never show in `ps`.
NETRC="$(mktemp)"; trap 'rm -f "$NETRC"' EXIT
printf 'machine %s login %s password %s\n' "$HOST" "$USER_NAME" "$FTP_PASSWORD" > "$NETRC"

for f in index.html abbas.png abbas-saleem.vcf; do
  echo "uploading $f"
  # -k: the Namecheap FTPS cert doesn't match the IP.
  curl -sS --ssl-reqd -k --netrc-file "$NETRC" --ftp-create-dirs \
    -T "$f" "ftp://$HOST/card/$f"
done
echo "done → https://llamagriffin.com/card/"
