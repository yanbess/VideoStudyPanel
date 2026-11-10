# Video Study Panel

A panel for learning from videos: control the playback speed and take
screenshots of the lesson. It is a row of speed buttons right under the video,
with a screenshot button at the end. It works on YouTube, Udemy, Coursera, and
other course sites (see [Where it works](#where-it-works)). One click, and the
video plays at the speed you want — no digging through the settings menu. One more,
and the current frame is saved to your computer.

![The speed panel under a YouTube video, paused at 1×](docs/panel.png)

## What it does

- **Ten speeds, from 0.25× to 3×.** YouTube's own menu stops at 2×.
- **The current speed is lit up** in blue, so you always see it at a glance.
- **Click the lit-up button to pause.** It turns into ▶; click it again to
  play.
- **Drag it anywhere.** Grab the dotted handle on the left of the panel and drop
  it where you like; it stays there on the next videos too.
- **Hotkeys:** `+` speeds up, `-` slows down (by one step, from 0.25× to 3×).
  The new speed briefly shows over the video. You can pick other keys.
- **Screenshot button** (the camera at the end of the panel, or the `S` key)
  pauses the video and saves the current frame to your Downloads folder, named
  like `12-34 - Video title (Channel).jpg`, where `12-34` is the moment in the
  video. Course sites have no channels, so there the name ends with the title.
  Some paid courses protect their videos from copying, and screenshots do not
  work there.
- **Your speed is remembered.** The next video, and the next lesson of a
  course, start at the same speed, even after you close the browser.
- **Keyboard shortcuts keep working.** Space, the arrow keys, and the rest still
  control the video after you click a button.
- Until you move it, the panel follows the player when you scroll, resize the
  window, or switch to theater mode, and it matches YouTube's dark look.

## Settings

Click the extension's icon in the browser toolbar (pin it from the puzzle-piece
menu to keep it in sight). There you can:

- **Hide the panel.** The hotkeys keep working.
- **Change the hotkeys** for speed up, slow down, and screenshot. Click a key
  box and press the new key, with Ctrl, Alt or Shift if you want. *Restore
  defaults* brings back `+`, `−` and `S`.
- **Pick the screenshot format:** JPG (the default, small files) or PNG
  (lossless, best for slides and code, but 5–10 times larger).
- **Change the panel size,** from 50% to 200%. *Reset size* brings back 100%.
- **Reset the position.** The panel goes back under the video.

## Where it works

- **Video sites:** YouTube video pages (`youtube.com/watch…`), not Shorts.
- **Course platforms:** Udemy, Coursera, edX, LinkedIn Learning, Pluralsight,
  Skillshare, Domestika, MasterClass, Khan Academy, Frontend Masters,
  egghead.io.
- **Russian-language platforms:** Stepik, Skillbox, Нетология (Netology),
  Яндекс Практикум (Yandex Practicum), and schools on GetCourse.
- **Course builders:** schools hosted on Teachable, Thinkific, and Kajabi, at
  their usual addresses (`*.teachable.com`, `*.thinkific.com`,
  `*.mykajabi.com`).

On these sites the panel controls the largest video of the lesson. It also
reaches players that sites embed from YouTube, Vimeo, Wistia, and Kinescope.

Schools with their own domain (for example a Teachable school at
`courses.example.com`) are not covered yet.

## Install

The extension is not in the Chrome Web Store, so it is installed from this page.
It takes about a minute and works in **Google Chrome, Microsoft Edge, Brave,
Opera, Vivaldi**, and other browsers built on Chrome.

1. At the top of this page, click the green **Code** button, then **Download
   ZIP**.
2. Unzip the file into a folder you will keep, such as `Documents\Video Study
   Panel`. The browser loads the extension from that folder, so do not delete
   it afterwards.
3. Open the extensions page of your browser. Type this in the address bar and
   press Enter:
   - Chrome, Brave, Vivaldi: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
4. Turn on **Developer mode**: a switch in the top right corner (in Edge, on the
   left).
5. Click **Load unpacked** and choose the unzipped folder, the one that has
   `manifest.json` in it.
6. Open any YouTube video. The panel appears right under it.

If YouTube was already open, reload its tab once.

> **About the warning:** the browser may say from time to time that developer
> mode extensions are on. That is normal for extensions installed this way;
> click **Keep** or close the message.

## Update

Download the ZIP again, replace the files in your folder with the new ones, then
click the circular **reload** arrow on the extension's card on the extensions
page. Your saved speed stays.

## Remove

On the extensions page, click **Remove** on the **Video Study Panel** card. You
can then delete its folder.

## Privacy

The extension keeps only its settings, stored in your browser: the speed you
chose, the panel's position and size, whether it is hidden, the hotkeys, and the
screenshot format. Screenshots are saved straight to your computer. It does not
collect, send, or share anything, and it has no access to your account, your
history, or other sites. It only runs on the sites listed in
[Where it works](#where-it-works), and the only permission it asks for is
storage, for those settings.

All of its code is in this repository, in a few small files.

## Questions

**I do not see the panel.**
Check that *Hide panel* is off in the settings, then reload the page. On
YouTube, the panel shows on regular video pages, not on Shorts, the home page,
or videos embedded in other sites. Check also that the
extension is turned on in the extensions page.

**The speed changes back by itself.**
Another speed extension may be fighting with this one; turn the other off.

**Does it work in Firefox or Safari?**
Not at the moment.

**Can I use other speeds, such as 1.1×?**
Not yet; the panel has the ten speeds listed above.
