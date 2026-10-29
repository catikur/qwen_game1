# macOS imzası ve noter onayı (Tur 74, docs/YAYIN.md → "İmza").
#
# `source tools/apple-signing.sh` (desktop.yml'nin paket adımları). Depodaki
# Apple sırları iş akışında SIGN_APPLE_* olarak geliyor ve Tauri'nin okuduğu
# APPLE_* adlarına takım takım aktarılıyor:
#   - imza: sertifika, parolası ve imza kimliği;
#   - noter onayı: Apple kimliği, uygulamaya özel parola ve takım (yalnız imza tamsa).
# Eksik takım hiç aktarılmıyor. Yarım bir takım Tauri'yi imzaya ya da noter
# onayına sokup paketi düşürürdü (Codex #104); boş bir değişken de boş
# sertifikayla imzalamaya zorlardı. Sırlar yokken ya da eksikken paket
# imzasız çıkıyor ve günlük eksiklerin adını yazıyor (değerlerini değil).

# Takımın sırları dolu mu; eksiklerin adları `apple_missing`te.
apple_group_complete() {
  apple_missing=""
  for apple_name in "$@"; do
    apple_source="SIGN_APPLE_$apple_name"
    [ -n "${!apple_source:-}" ] || apple_missing="$apple_missing APPLE_$apple_name"
  done
  [ -z "$apple_missing" ]
}

apple_group_export() {
  for apple_name in "$@"; do
    apple_source="SIGN_APPLE_$apple_name"
    export "APPLE_$apple_name=${!apple_source}"
  done
}

if [ "${RUNNER_OS:-}" = "macOS" ]; then
  if apple_group_complete CERTIFICATE CERTIFICATE_PASSWORD SIGNING_IDENTITY; then
    apple_group_export CERTIFICATE CERTIFICATE_PASSWORD SIGNING_IDENTITY
    if apple_group_complete ID PASSWORD TEAM_ID; then
      apple_group_export ID PASSWORD TEAM_ID
      echo "macOS: imzalı, noter onayına gidiyor"
    else
      echo "macOS: imzalı, noter onayı yok (eksik:$apple_missing)"
    fi
  else
    echo "macOS: imzasız (eksik:$apple_missing)"
  fi
fi
unset -f apple_group_complete apple_group_export
unset apple_missing apple_name apple_source
