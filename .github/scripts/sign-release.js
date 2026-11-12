// Makes the release build use the private Prangan signing key instead of the public debug key that the
// generated Android project uses by default. Run from mobile/ after `expo prebuild`.
// Needs env: ANDROID_KEYSTORE_PASSWORD (the keystore file is written by the workflow to android/app/prangan-release.keystore).
const fs = require('fs');
const file = 'android/app/build.gradle';
let g = fs.readFileSync(file, 'utf8');
if (g.includes('signingConfigs.release')) process.exit(0);

const release = `
        release {
            storeFile file('prangan-release.keystore')
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias 'prangan'
            keyPassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
        }`;
const at = g.indexOf('signingConfigs {');
if (at < 0) throw new Error('signingConfigs block not found in build.gradle');
g = g.slice(0, at + 'signingConfigs {'.length) + release + g.slice(at + 'signingConfigs {'.length);

// inside buildTypes → release { … } switch the signing config
const bt = g.indexOf('buildTypes {');
const rel = g.indexOf('release {', bt);
const sc = g.indexOf('signingConfig signingConfigs.debug', rel);
if (bt < 0 || rel < 0 || sc < 0) throw new Error('release build type not found in build.gradle');
g = g.slice(0, sc) + 'signingConfig signingConfigs.release' + g.slice(sc + 'signingConfig signingConfigs.debug'.length);
fs.writeFileSync(file, g);
console.log('Release build will be signed with the Prangan key.');
