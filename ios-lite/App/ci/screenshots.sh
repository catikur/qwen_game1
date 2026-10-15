#!/usr/bin/env bash
# Simülatörde senaryo kareleri: uygulama `-liteScenario <ad>` ile açılıyor
# (bot şehri o ana kadar oynamış oluyor), ekran görüntüsü alınıyor.
# Kullanım: ios-lite/App/ci/screenshots.sh <.app yolu> <çıkış dizini>
set -euo pipefail
APP="$1"
OUT="$2"
BUNDLE=com.catikur.capitalforgelite
mkdir -p "$OUT"

# Kullanılabilir ilk "Pro" olmayan iPhone; yoksa herhangi bir iPhone.
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = [d for runtime, ds in json.load(sys.stdin)["devices"].items() if "iOS" in runtime for d in ds]
phones = [d for d in devices if d["name"].startswith("iPhone")]
plain = [d for d in phones if "Pro" not in d["name"] and "SE" not in d["name"] and "mini" not in d["name"]]
print((plain or phones)[-1]["udid"])
')
echo "Simülatör: $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 || true
xcrun simctl install "$UDID" "$APP"

shot() {
  local name="$1"; shift
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE" "$@"
  # Geç senaryoda bot dört saatlik oyunu açılışta oynuyor; bekleme payı geniş.
  sleep 14
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png"
  echo "kare: $name"
}

shot tr-start -AppleLanguages "(tr)" -liteScenario start
shot tr-early -AppleLanguages "(tr)" -liteScenario early
shot tr-council -AppleLanguages "(tr)" -liteScenario council
shot tr-mid -AppleLanguages "(tr)" -liteScenario mid
shot tr-late -AppleLanguages "(tr)" -liteScenario late
shot tr-offline -AppleLanguages "(tr)" -liteScenario mid -liteOffline 9000
shot en-mid -AppleLanguages "(en)" -liteScenario mid
ls -la "$OUT"
