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
WAIT=24 shot night-islands -AppleLanguages "(tr)" -liteScenario islands
WAIT=24 shot night-island3 -AppleLanguages "(tr)" -liteScenario islands -liteIsland 3
shot night-league -AppleLanguages "(tr)" -liteScenario mid -liteLeague -liteLeagueSheet
xcrun simctl ui "$UDID" appearance light
# L7: takımada, bina kademeleri, temalar, holding haritası.
WAIT=24 shot tr-islands -AppleLanguages "(tr)" -liteScenario islands
WAIT=24 shot tr-island1 -AppleLanguages "(tr)" -liteScenario islands -liteIsland 1
WAIT=24 shot tr-island2 -AppleLanguages "(tr)" -liteScenario islands -liteIsland 2
WAIT=24 shot tr-island3 -AppleLanguages "(tr)" -liteScenario islands -liteIsland 3
WAIT=24 shot tr-skyline -AppleLanguages "(tr)" -liteScenario skyline
shot tr-desert -AppleLanguages "(tr)" -liteScenario desert
shot tr-snow -AppleLanguages "(tr)" -liteScenario snow
shot tr-map -AppleLanguages "(tr)" -liteScenario snow -liteMap
# L8: haftalık lig (örnek veriyle; sunucu yok), özel ligler, kart, "yakında".
shot tr-league -AppleLanguages "(tr)" -liteScenario mid -liteLeague -liteLeagueSheet
shot tr-league-private -AppleLanguages "(tr)" -liteScenario mid -liteLeague -liteLeagueSheet -liteLeaguePrivate
shot tr-league-card -AppleLanguages "(tr)" -liteScenario mid -liteLeague -liteScroll league
shot tr-league-soon -AppleLanguages "(tr)" -liteScenario mid -liteLeagueSheet
shot en-league -AppleLanguages "(en)" -liteScenario mid -liteLeague -liteLeagueSheet
xcrun simctl shutdown "$UDID" || true

# Yatay kare: uygulama yatay döndüyse ya da yatay düzeni 90° çevrilmiş kapta
# çizdiyse (Documents/orientation.txt) ve görüntü cihazın doğal (dikey)
# yönünde geldiyse çevir. Hiçbiri değilse olduğu gibi bırak: dikey düzeni yan
# yatırıp "yatay" diye göstermek yanıltıcı.
land() {
  local name="$1"; shift
  local data note f w h
  data=$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data 2>/dev/null || true)
  rm -f "$data/Documents/orientation.txt"
  shot "$name" "$@"
  note=$(cat "$data/Documents/orientation.txt" 2>/dev/null || echo "?")
  echo "yön ($name): $note"
  f="$OUT/$name.png"
  w=$(sips -g pixelWidth "$f" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/ {print $2}')
  if [ "$w" -lt "$h" ]; then
    case "$note" in
      landscapeRight|rotated) sips -r 270 "$f" >/dev/null; echo "döndürüldü (270): $f" ;;
      landscapeLeft) sips -r 90 "$f" >/dev/null; echo "döndürüldü (90): $f" ;;
      *) echo "UYARI: $name yatay değil ($note); döndürülmedi" ;;
    esac
  fi
}

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
  land ipad-land -AppleLanguages "(tr)" -liteScenario listed -liteLandscape
  shot ipad-settings -AppleLanguages "(tr)" -liteScenario mid -liteSettings
  xcrun simctl ui "$UDID" appearance dark
  land ipad-night-land -AppleLanguages "(tr)" -liteScenario late -liteLandscape
  xcrun simctl ui "$UDID" appearance light
else
  echo "iPad simülatörü yok; iPad kareleri atlandı"
fi
ls -la "$OUT"
