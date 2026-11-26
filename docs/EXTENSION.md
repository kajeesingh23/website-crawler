# The Plax Chrome extension

The extension lets you select parts of any website in your own Chrome (with your logins and your
other extensions), see how they're built, build prompts and code, and save them to your Plax
Library. It needs no account and nothing leaves your computer.

## Install (once)

1. In the project folder, build it:

   ```bash
   npm run extension:zip
   ```

   This creates the folder `dist/extension` and the file `dist/plax-extension-<version>.zip`.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (the switch at the top right).
4. Press **Load unpacked** and choose the `dist/extension` folder.
   (Got the ZIP from someone? Unzip it first, then choose the unzipped folder.)
5. Click the puzzle-piece icon in Chrome's toolbar and pin **Plax**.

To update after changing the code: run `npm run extension:build` again, then press the reload
arrow on the Plax card in `chrome://extensions`.

## Use it

1. Open any website and click the **Plax** button. The side panel opens on the right.
2. Press **Start selecting**. Move the pointer over the page: Plax outlines what you'd pick and names
   it. Click to add it. Keep clicking to add more; each selection gets a number on the page.
   - Plax picks the whole component: clicking a card's title picks the card.
   - Hold **Alt** (Option on a Mac) while clicking to pick exactly what's under the pointer.
   - **Larger area**, **Inside**, **Previous** and **Next** adjust the newest selection.
   - Press **Esc** on the page to stop selecting.
3. In the panel, use the arrows to reorder, ✕ to remove, **Undo** for the last change and
   **Clear all** to start over. Your list is kept even if you close the panel.
4. Open a selection to see:
   - **Design**: colours, font, layout, spacing, corners, shadow and motion, as measured.
   - **Prompt**: a ready-to-paste brief in five modes. **Copy** or **Download .md**.
   - **Code**: HTML/CSS, Tailwind, design tokens (JSON) or React. Copy or download.
   - **Live copy**: the exact copy, running in a locked-down frame.
5. **Save to Library** sends it to the Plax app (after you connect them, below).

## Connect it to the Plax app

1. Start the app (`npm run dev`) and open **Settings** at http://localhost:3000/settings.
2. Under **Browser extension**, press **Connect the extension** and copy the code. It's shown once.
3. In the side panel, open **Settings**, paste the code, keep the address `http://localhost:3000`
   (or the one your app uses), and press **Connect**.

The dot next to "Connected" turns green. A new code or **Disconnect** (in either place) ends the
connection.

## What it's allowed to do, and why

| Permission | Why |
|---|---|
| Side panel | To show Plax beside the page |
| `activeTab` | To work on the tab where you click the Plax button, and only that tab |
| `scripting` | To put the selection layer on that page |
| `storage` | To keep your list of selections |
| `http://localhost/*` | To reach the Plax app on your computer |
| Every website *(optional)* | Only if you choose **Allow on every website**: saves clicking the Plax button on each new site. You can take it back in the panel's Settings. |

## Limits (honest ones)

- **Hover, focus and scroll effects aren't tested by the extension.** Chrome doesn't let extensions
  move your real mouse. Plax records what runs on its own and which changes are set up to animate;
  to test hover and scroll, use **Analyse Website** in the app.
- **New site, new click.** Chrome gives an extension access to a page when you click its button
  there. After moving to another website in the same tab, click the Plax button again (or allow
  every website).
- **Pictures** are taken from what's on screen. Something taller or wider than the window is
  pictured in its visible part, and the panel says so. Chrome allows about two pictures a second.
- **Chrome's own pages** (`chrome://…`) and the Chrome Web Store can't be used by any extension.
- **Embedded frames from other websites** and closed parts of a page (closed shadow DOM) can't be
  read inside; they're pictured and marked.
- **Storage**: Chrome gives extensions about 10 MB. If it fills up, the panel asks you to save or
  remove some selections.

## Chrome Web Store

The ZIP is ready to upload, but publishing needs your own Chrome Web Store developer account. Until
then, the extension is installed with **Load unpacked** as above; it isn't on the store.
