# Music Recognition Firefox extension

The extension is based on the [Music Recognition API](https://audd.io).

## This is an experimental Firefox version. It won't work by default.

The extension uses Manifest V3; to enable the developer preview for it, as per [some random website probably from Mozilla](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/), you need to go to `about:config`, and:
 - Set `extensions.manifestV3.enabled` to `true`.
 - Set `xpinstall.signatures.required` to `false`.
 
After that, you can go to `about:debugging#/runtime/this-firefox` and add a temporary extension by selecting the `manifest.json`.

## Current issues

I wasn't able to make Firefox add the extension permamently, from an archive. I don't know why, help would be welcome in #1.

The audio stops playing ater the extension stops recording it until the tab is reloaded, help would be welcome in #2.

### Original description

Recognize any music from any website in your browser
Install the AudD extension and click on its icon to identify the song playing on the current tab.

You can [install this extension from the Chrome Web Store](https://audd.app/chrome).

AudD extension:
- Recognizes the music playing in your browser;
- Finds music in the AudD database with more than 65 million songs using its music recognition technology;
- Shows lyrics for identified songs;
- Shows links to listen to the songs on Apple Music, Spotify, Deezer, YouTube Music;
- Displays the exact moment in the recognized song when the sound from the browser is played.

Music Recognition API: https://audd.io

Created and designed by the AudD.io team with help from Eric Stark, Mitchell Kossoris, and Ivan Kasatkin.

Extension Powered By AudD® Music recognition API.

Watch the video below to see how it works:

[![Demo](https://img.youtube.com/vi/xcASh3kdKp0/maxresdefault.jpg)](https://www.youtube.com/watch?v=xcASh3kdKp0)

