> ⚠️ RedBoard was built as part of another project of mine, and that project is finished, so I'm **not actively developing it any more**. It works and is published as is.
> You're welcome to fork it, adapt it, or open a pull request. Under the MIT license you can use it however you like. I may not review issues or PRs, though, so a fork is the surest way to take it further.

# RedBoard

**A local, dependency-free diagram editor that people and AI can both edit.**

RedBoard runs entirely in your browser. Open `index.html` and start drawing; nothing needs to be installed and there is no server, build step, account or network connection. Each board is saved as one readable JSON file (`.redboard.json`). Because the file is plain text, an AI assistant can create or edit diagrams that open straight in the editor.

## Features

- **Shapes:** rectangles, ellipses, diamonds, sticky notes, text, and freehand drawing
- **Pictures:** click **Picture**, drop an image onto the canvas, or paste one from the clipboard. Pictures move and resize like shapes, and their pixels are embedded in the saved board
- **Connectors:** straight, elbow and curved. Endpoints can attach to shapes and follow them when moved
- **Styling:** colors, fills, line weights, dashes, text size, opacity and layering
- **Editing:** box selection, Shift-select, drag, resize handles, duplicate, keyboard shortcuts, zoom and pan
- **Groups:** select elements and click **Group** to put them in a labeled frame. Drag the frame to move everything in it, or click **Ungroup** to separate them
- **Charts:** built-in pie and line charts, with data you edit in the inspector
- **Auto layout** for connected shapes
- **Undo / redo** and automatic saving in the browser
- **Files:** open and save portable `.redboard.json` boards, and export standalone SVG images
- **Source view:** the canvas and the JSON source describe the same document, and you can edit either one

## Getting started

1. Download or clone this repository.
2. Open `index.html` in a modern desktop browser.
3. Start from the example on the canvas, or click **Open** and choose a file from [`examples/`](examples).

**Tips:** double-click a shape to edit its text (Ctrl+Enter or clicking outside finishes the edit). Draw an arrow from one shape to another to connect them. Space+drag pans and the mouse wheel zooms. The **Shortcuts & help** button lists every shortcut.

### Saving

The browser autosave only covers this browser and this page location. **Save board** downloads a portable `.redboard.json` file. The app never writes back to the file you opened, so save again after making changes. Open and New can be undone. The source editor keeps edits you haven't applied until you click **Apply to canvas** or **From canvas**.

## Diagrams with AI

RedBoard's format is designed so an AI can write it directly:

- [`FORMAT.md`](FORMAT.md) documents the full document format
- [`SKILL.md`](SKILL.md) is a ready-made skill file that teaches an AI assistant to create and edit RedBoard diagrams

Ask the AI for a `.redboard.json` file, then click **Open** in RedBoard and choose it. You can also paste the JSON into **Source → Apply to canvas**.

A minimal board:

```json
{
  "format": "redboard",
  "version": 1,
  "name": "A simple flow",
  "elements": [
    {"id":"start","type":"rectangle","x":80,"y":120,"w":180,"h":90,"text":"Start"},
    {"id":"finish","type":"ellipse","x":400,"y":120,"w":180,"h":90,"text":"Finish"},
    {"id":"next","type":"arrow","x":260,"y":165,"w":140,"h":0,"from":"start","to":"finish"}
  ]
}
```

## Project structure

| File | Purpose |
|---|---|
| `index.html` | The app page |
| `style.css` | Styles |
| `app.js` | Editor: canvas, tools, selection, history, files |
| `extras.js` | Pictures, groups and charts |
| `format.js` | Document validation, normalization and auto layout (also usable from Node as CommonJS) |
| `examples/` | Example boards |
| `tests/` | Format and browser tests |

## Development

There are no dependencies. Run the format tests with Node:

```bash
node tests/format.test.js
```

The browser tests are optional and use Playwright with Microsoft Edge. Set `PLAYWRIGHT_MODULE` to the path of an installed Playwright module, then run:

```bash
node tests/browser.test.js
node tests/extras.test.js
```

You can validate a board from Node:

```js
const fs = require('node:fs');
const { validate } = require('./format.js');
validate(JSON.parse(fs.readFileSync('examples/architecture.redboard.json', 'utf8')));
```

## License

[MIT](LICENSE)
