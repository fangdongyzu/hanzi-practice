# Ink & Order

A responsive, static Chinese handwriting studio for GitHub Pages.

- Paste up to 200 traditional or simplified Chinese characters, including paragraphs. Punctuation, spaces, emoji, and Latin text are ignored. Repeated characters remain in reading order.
- **Watch:** animate stroke order, pause/resume, change speed, or select a single stroke.
- **Trace:** follow an outline with a finger, stylus, or mouse. The next stroke must match its shape, direction, and order. Hints appear after two misses.
- **Write:** start on a blank grid with no outlines, stroke previews, or automatic hints. The correct next stroke and direction are still required. Strokes are never automatically accepted after mistakes.
- Show tone-marked Mandarin pinyin and Vietnamese meanings beneath the selected character. Expand “More readings & meanings” for alternate pronunciations and full dictionary glosses. Traditional and simplified forms are supported.
- Track completion for Trace and Write separately, saved with your lesson on the current browser/device.
- Print worksheets with cumulative stroke-order diagrams, a model character, a tracing cell, and four blank cells. Paper cannot check stroke order.
- Supports phones, tablets, laptops, and desktop computers. The drawing surface keeps its progress when resized.

## Run locally

No build step, package installation, server account, or API key is needed.

```sh
python3 -m http.server 4173
```

Open <http://localhost:4173/>. Serve over HTTP; opening `index.html` directly may prevent local character data from loading.

## GitHub Pages

Publish the root of the `main` branch under **Settings → Pages → Deploy from a branch**. All application paths are relative, so repository subpaths work.

## Data and privacy

Lesson text and progress are saved in browser `localStorage`. There is no account, analytics, cloud database, or application backend. A Chinese–Vietnamese dictionary for 14,559 character forms is bundled in small, cached files; no translation API is used. Thirty sample characters are bundled locally. Other characters fetch their stroke data individually from jsDelivr using a pinned `hanzi-writer-data@2.0.1` URL; the requested character is visible to that data host. Fonts load from Google Fonts, with local system fallbacks. New characters require connectivity. There is no service worker or full offline guarantee.

The Make Me a Hanzi dataset supports many common traditional and simplified characters, but not every rare character. Unavailable characters show an error with retry/navigation controls. Glyph forms and stroke order follow the dataset and may differ from Taiwanese, Hong Kong, or other regional standards. Handwriting recognition uses geometric matching and is a practice aid, not a calligraphy or examination grade.

## Attribution and licenses

- [Hanzi Writer 3.7.3](https://github.com/chanind/hanzi-writer), MIT license. The pinned JavaScript is bundled in `vendor/`; see `vendor/HANZI-WRITER-LICENSE.txt`.
- [Hanzi Writer Data 2.0.1](https://github.com/chanind/hanzi-writer-data), derived from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) and Arphic fonts, under the Arphic Public License. See `vendor/ARPHICPL.TXT`. Bundled JSON data is unmodified.
- Fonts: DM Sans and Manrope via Google Fonts, with system fallback fonts.

- [CVDICT](https://github.com/kemonra/CVDICT), Chinese–Vietnamese meanings by Phong Phan and CC-CEDICT contributors, CC BY-SA 4.0. The single-character subset is indexed for both writing systems and grouped by reading. See `data/character-dictionary/NOTICE.txt` for source revision, transformations, and attribution; full license: `licenses/CC-BY-SA-4.0.txt`. Dictionary definitions and readings vary by context.
