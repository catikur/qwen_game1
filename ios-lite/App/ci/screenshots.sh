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
xcrun simctl ui "$UDID" appearance light || true
xcrun simctl install "$UDID" "$APP"

shot() {
  local name="$1"; shift
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE" "$@"
  # Geç senaryoda bot dört saatlik oyunu açılışta oynuyor; bekleme payı geniş.
  # Senaryo modunda saat donuk: bekleme süresi kareyi değiştirmiyor.
  sleep "${WAIT:-14}"
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
# L4: halka arz, borsa, ikinci şehir, ayarlar.
shot tr-ipo -AppleLanguages "(tr)" -liteScenario ipo
shot tr-listed -AppleLanguages "(tr)" -liteScenario listed -liteScroll market
WAIT=20 shot tr-city2 -AppleLanguages "(tr)" -liteScenario city2
shot tr-settings -AppleLanguages "(tr)" -liteScenario mid -liteSettings
shot en-listed -AppleLanguages "(en)" -liteScenario listed -liteScroll market
# L5: gece (cihaz koyu modda; uygulama "Cihaz" görünümünde ona uyuyor).
xcrun simctl ui "$UDID" appearance dark
shot night-mid -AppleLanguages "(tr)" -liteScenario mid
shot night-council -AppleLanguages "(tr)" -liteScenario council
shot night-listed -AppleLanguages "(tr)" -liteScenario listed -liteScroll market
shot night-settings -AppleLanguages "(tr)" -liteScenario mid -liteSettings
xcrun simctl ui "$UDID" appearance light
xcrun simctl shutdown "$UDID" || true

# L6: iPad. Tercih "iPad Air", yoksa herhangi bir iPad (Pro ya da mini değil).
IPAD=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = [d for runtime, ds in json.load(sys.stdin)["devices"].items() if "iOS" in runtime for d in ds]
pads = [d for d in devices if d["name"].startswith("iPad")]
air = [d for d in pads if "Air" in d["name"] and "13" not in d["name"]]
plain = [d for d in pads if "mini" not in d["name"]]
print(((air or plain or pads) or [{"udid": ""}])[-1]["udid"])
')
if [ -n "$IPAD" ]; then
  echo "iPad simülatörü: $IPAD"
  UDID="$IPAD"
  xcrun simctl boot "$UDID" || true
  xcrun simctl bootstatus "$UDID" -b
  xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged --batteryLevel 100 --wifiBars 3 || true
  xcrun simctl ui "$UDID" appearance light || true
  xcrun simctl install "$UDID" "$APP"
  shot ipad-mid -AppleLanguages "(tr)" -liteScenario mid
  shot ipad-land -AppleLanguages "(tr)" -liteScenario listed -liteLandscape
  shot ipad-settings -AppleLanguages "(tr)" -liteScenario mid -liteSettings
  xcrun simctl ui "$UDID" appearance dark
  shot ipad-night-land -AppleLanguages "(tr)" -liteScenario late -liteLandscape
  xcrun simctl ui "$UDID" appearance light
  # Yatay kareler: ekran görüntüsü cihazın doğal (dikey) yönünde gelirse çevir.
  for f in "$OUT"/ipad-*land*.png; do
    w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/ {print $2}')
    h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/ {print $2}')
    if [ "$w" -lt "$h" ]; then sips -r 270 "$f" >/dev/null; echo "döndürüldü: $f"; fi
  done
else
  echo "iPad simülatörü yok; iPad kareleri atlandı"
fi
ls -la "$OUT"
