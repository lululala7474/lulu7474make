#!/bin/bash
# 하루 플래너를 안드로이드 APK로 만듭니다.
# 사용법: build-planner.sh <planner폴더> <출력apk> [키스토어경로]
set -e
SRC=$1; OUT=$2; PKG=com.lulu.haruplanner; LABEL="하루 플래너"; COLOR="#0f1117"
SDK=${ANDROID_SDK:-/opt/android-sdk}; BT=$SDK/build-tools/34.0.0; JAR=$SDK/platforms/android-34/android.jar
HERE=$(cd "$(dirname "$0")" && pwd)
KS=${3:-$HERE/my-release.keystore}
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p $W/res/mipmap-xxxhdpi $W/res/values $W/assets/www $W/src/${PKG//.//} $W/classes
# 앱 파일 복사 (서비스워커·설명서는 APK에 불필요)
cp -r "$SRC"/index.html "$SRC"/style.css "$SRC"/script.js "$SRC"/manifest.webmanifest "$SRC"/icons $W/assets/www/
cp "$SRC/icons/icon-192.png" $W/res/mipmap-xxxhdpi/ic_launcher.png
cat > $W/res/values/strings.xml <<X
<resources><string name="app_name">$LABEL</string></resources>
X
cat > $W/AndroidManifest.xml <<X
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$PKG" android:versionCode="1" android:versionName="1.0">
  <uses-sdk android:minSdkVersion="29" android:targetSdkVersion="34"/>
  <application android:label="@string/app_name" android:icon="@mipmap/ic_launcher" android:allowBackup="false" android:theme="@android:style/Theme.Material.NoActionBar">
    <activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden" android:windowSoftInputMode="adjustResize">
      <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity>
  </application>
</manifest>
X
sed -e "s/__PKG__/$PKG/" -e "s/__COLOR__/$COLOR/g" "$HERE/MainActivityPlanner.java.tpl" > $W/src/${PKG//.//}/MainActivity.java
$BT/aapt2 compile --dir $W/res -o $W/res.zip
$BT/aapt2 link -o $W/base.apk -I $JAR --manifest $W/AndroidManifest.xml -A $W/assets $W/res.zip
javac -encoding UTF-8 -nowarn --release 8 -cp $JAR -d $W/classes $(find $W/src -name '*.java')
(cd $W/classes && jar cf ../app.jar .)
$BT/d8 --min-api 29 --lib $JAR --output $W $W/app.jar
(cd $W && zip -q base.apk classes.dex)
$BT/zipalign -f 4 $W/base.apk $W/aligned.apk
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias mykey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Haru Planner" >/dev/null 2>&1
$BT/apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out "$OUT" $W/aligned.apk
$BT/apksigner verify "$OUT" && echo "OK: $OUT"
