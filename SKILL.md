---
name: redboard
description: Create or edit text-based RedBoard diagrams for the local RedBoard canvas editor. Use for flowcharts, architecture diagrams, annotated sketches, and visual boards saved as RedBoard JSON.
---

# RedBoard diagrams

Create or edit `.redboard.json` files that the adjacent `index.html` opens directly in a browser. Read [FORMAT.md](FORMAT.md) for the unified document schema. Use JSON for all lossless work, including visual positioning, freehand drawings, sticky notes, colors, and attached connectors.

When editing an existing board, read its current file, preserve existing IDs and unaffected elements, and make the requested changes. Never assume the browser's local autosave has been written to the file: if the user's latest edits exist only in the browser, ask them to save the board first.

Use descriptive unique IDs. Place nodes with enough room for their labels; allow roughly 10 pixels per character at font size 18, with 22 pixels of total horizontal padding and 25 pixels per line. Diamonds have less usable label space. Use explicit newlines where useful. Keep related nodes aligned with at least 70 pixels between them. Use `from` and `to` IDs on connectors so edges follow nodes during moves. Keep labels concise and preserve the user's terminology.

For pictures, create `image` elements with a `src` containing an embedded base64 PNG, JPEG, WebP, or GIF data URL. Preserve this data when editing existing boards; never replace it with a local path or remote URL. Set `x`, `y`, `w`, and `h` to position and size the picture; `text` can hold a descriptive name.

Use `group` for a labeled frame and set each member's `groupId` to its ID. Keep member coordinates absolute and place the frame before its members. Nested groups are unsupported. For charts, use native `pie` or `chart` elements and numeric `data`, not drawings that imitate charts. Read the corresponding type section in FORMAT.md for required slice/series fields, axis behavior, and examples. Keep chart data unchanged unless the requested edit concerns its values.

The element array defines paint order. Put connectors before nodes when they should pass underneath. Use text elements for titles and sticky elements for annotations. Colors must be hex values or `transparent`. Store freehand points relative to the drawing's `x,y` origin.

Validate a generated board using the project's shared validator:

```js
const fs = require('node:fs');
const { validate } = require('./format.js');
validate(JSON.parse(fs.readFileSync('example.redboard.json', 'utf8')));
```

Treat RedBoard JSON as the single editable document format. Preserve all visual data and stable IDs when reading, editing, and saving a board. SVG is only a static export.

Deliver the board file and a link to the local editor. The user can choose **Open** or paste the JSON into **Source → Apply to canvas**. Save a portable file after browser edits. For a static illustration, use **SVG** in the editor.
