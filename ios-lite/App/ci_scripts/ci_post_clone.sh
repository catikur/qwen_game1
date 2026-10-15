#!/bin/sh
# Xcode Cloud: proje dosyası repoda değil (.gitignore), project.yml'den
# XcodeGen ile üretiliyor. Bu betik klonlamadan sonra, paket çözümlemeden
# önce çalışıyor.
set -e

brew install xcodegen

cd "$CI_PRIMARY_REPOSITORY_PATH/ios-lite/App"
xcodegen generate
