# Chrome Web Store listing

Texts and answers to paste into the Developer Dashboard, field by field.

## Store listing tab

**Name** (taken from manifest.json): Video Study Panel

**Summary** (from the manifest `description`, up to 132 characters):

> A panel for learning from videos: control the playback speed and save screenshots of YouTube and Udemy lessons in one click.

**Category:** Education

**Language:** English

**Description:**

```
A panel for learning from videos: control the playback speed and take screenshots of the lesson. A row of speed buttons sits right under the video, with a screenshot button at the end. One click, and the video plays at the speed you want: no digging through the settings menu. One more, and the current frame is saved to your computer.

• Ten speeds, from 0.25× to 3×. YouTube's own menu stops at 2×.
• The current speed is lit up. Click it again to pause, and once more to play.
• Your speed is remembered for the next videos, even after you restart the browser.
• Drag the panel anywhere on the page by its handle, and resize it from 50% to 200%.
• Hotkeys: + speeds up, − slows down, S takes a screenshot. All three can be changed.
• Screenshot button: pauses the video and saves the current frame as JPG or PNG, named like "12-34 - Video title (Channel).jpg".
• Hide the panel and keep using only the hotkeys, if you prefer.

Works on YouTube video pages and on Udemy course lectures.

Privacy: the extension stores only your settings, in your browser. It does not collect, send, or share anything.

Not affiliated with YouTube, Google, or Udemy.
```

**Graphic assets:**

- Store icon 128×128: `icons/icon128.png`
- Small promo tile 440×280: `store/promo-440x280.png`
- Screenshots, 1280×800 (at least one, up to five): `store/screenshot-1.png`
  is ready. A second one with the settings popup open is a good idea.

To make another screenshot: press Win+Shift+S, select the player with the
panel, then resize the picture to exactly 1280×800, for example with
`magick shot.png -resize 1280x800^ -gravity center -extent 1280x800 store/screenshot-2.png`.

To rebuild the promo tile after changing the icon (the tile's SVG has no icon;
it is added on top):

```
cd store
magick -background none promo-440x280.svg -flatten ( ../icons/icon.svg -background none -density 300 -resize 96x96 ) -geometry +28+44 -composite promo-440x280.png
```

## Privacy practices tab

**Single purpose:**

> Lets the user change the playback speed of YouTube and Udemy videos with on-page buttons and hotkeys, and save a screenshot of the current video frame.

**Permission justification, `storage`:**

> Saves the user's settings in the browser: the chosen speed, panel position and size, whether the panel is hidden, the hotkeys, and the screenshot format.

**Host permission justification** (the content script runs on `https://www.youtube.com/*` and `https://*.udemy.com/*`):

> The extension adds its speed panel to video pages on these two sites and controls the video player on them. It does not run on any other site.

**Remote code:** No, I am not using remote code.

**Data usage:** check none of the data types. Then check all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/yanbess/VideoStudyPanel#privacy

## Distribution tab

**Visibility:** Public (or Unlisted, to share it only by link).

**Regions:** All regions.
