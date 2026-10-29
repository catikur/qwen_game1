# macOS imzası ve noter onayı (Tur 74, docs/YAYIN.md → "İmza").
#
# `source tools/apple-signing.sh` (desktop.yml'nin paket adımları). Depodaki
# Apple sırları iş akışında SIGN_APPLE_* olarak geliyor; dolu olanlar Tauri'nin
# okuduğu APPLE_* adlarına aktarılıyor. Boşları aktarmak Tauri'yi boş
# sertifikayla imzalamaya zorlardı: sırlar yokken paket imzasız kalıyor.
if [ "${RUNNER_OS:-}" = "macOS" ] && [ -n "${SIGN_APPLE_CERTIFICATE:-}" ]; then
  for name in CERTIFICATE CERTIFICATE_PASSWORD SIGNING_IDENTITY ID PASSWORD TEAM_ID; do
    source_name="SIGN_APPLE_$name"
    if [ -n "${!source_name:-}" ]; then export "APPLE_$name=${!source_name}"; fi
  done
  if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    echo "macOS: imzalı, noter onayına gidiyor"
  else
    echo "macOS: imzalı; noter onayı için APPLE_ID, APPLE_PASSWORD ve APPLE_TEAM_ID eksik"
  fi
elif [ "${RUNNER_OS:-}" = "macOS" ]; then
  echo "macOS: imzasız (APPLE_CERTIFICATE sırrı yok)"
fi
