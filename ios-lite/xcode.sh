#!/usr/bin/env bash
# CapitalForge Lite: Xcode projesini oluşturur ve açar (Mac'te).
#
#   ./ios-lite/xcode.sh
#
# Proje dosyası depoda tutulmuyor; ios-lite/App/project.yml'den XcodeGen ile
# üretiliyor. Homebrew yoksa: https://brew.sh
set -euo pipefail
cd "$(dirname "$0")/App"

if ! command -v xcodegen >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "XcodeGen gerekli ve Homebrew bulunamadı. Önce Homebrew'u kurun: https://brew.sh" >&2
    exit 1
  fi
  echo "XcodeGen kuruluyor (brew install xcodegen)…"
  brew install xcodegen
fi

xcodegen generate
open CapitalForgeLite.xcodeproj
echo "Xcode açıldı. Signing & Capabilities → Team: kendi Apple kimliğinizi seçin, iPhone'unuzu seçip ▶︎ ile çalıştırın."
