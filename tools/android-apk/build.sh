#!/bin/bash
# 사용법: build.sh <웹앱폴더> <패키지명> <앱이름> <색상> <출력apk>
set -e
SRC=$1; PKG=$2; LABEL=$3; COLOR=$4; OUT=$5
SDK=/opt/android-sdk; BT=$SDK/build-tools/34.0.0; JAR=$SDK/platforms/android-34/android.jar
HERE=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p $W/res/mipmap-xxxhdpi $W/res/values $W/assets/www $W/src/${PKG//.//} $W/classes
cp "$SRC"/*.html "$SRC"/*.js "$SRC"/*.css "$SRC"/*.json "$SRC"/*.png $W/assets/www/
cp "$SRC/icon-192.png" $W/res/mipmap-xxxhdpi/ic_launcher.png
cat > $W/res/values/strings.xml <<X
<resources><string name="app_name">$LABEL</string></resources>
X
cat > $W/AndroidManifest.xml <<X
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$PKG" android:versionCode="1" android:versionName="1.0">
  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34"/>
  <uses-permission android:name="android.permission.INTERNET"/>
  <application android:label="@string/app_name" android:icon="@mipmap/ic_launcher" android:theme="@android:style/Theme.Material.Light.NoActionBar">
    <activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden">
      <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity>
  </application>
</manifest>
X
sed -e "s/__PKG__/$PKG/" -e "s/__COLOR__/$COLOR/" "$HERE/MainActivity.java.tpl" > $W/src/${PKG//.//}/MainActivity.java
$BT/aapt2 compile --dir $W/res -o $W/res.zip
$BT/aapt2 link -o $W/base.apk -I $JAR --manifest $W/AndroidManifest.xml -A $W/assets $W/res.zip
javac -g:none -encoding UTF-8 -nowarn --release 11 -cp $JAR -d $W/classes $(find $W/src -name '*.java') 2>&1 | grep -v "warning" || true
(cd $W/classes && jar cf ../app.jar .)
$BT/d8 --min-api 24 --lib $JAR --output $W $W/app.jar
(cd $W && zip -q base.apk classes.dex)
$BT/zipalign -f 4 $W/base.apk $W/aligned.apk
KS=$HERE/my-release.keystore
[ -f $KS ] || keytool -genkeypair -keystore $KS -storepass android -keypass android -alias mykey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=My Apps" >/dev/null 2>&1
$BT/apksigner sign --ks $KS --ks-pass pass:android --key-pass pass:android --out "$OUT" $W/aligned.apk
$BT/apksigner verify "$OUT" && echo "OK: $OUT"
