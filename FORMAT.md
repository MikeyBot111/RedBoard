# RedBoard document format · version 1

The native format is UTF-8 JSON, conventionally named `something.redboard.json`. It is readable and editable by people and AI. There is no server, build step, remote library, or network dependency.

```json
{
  "format": "redboard",
  "version": 1,
  "name": "A simple flow",
  "elements": [
    {"id":"start","type":"rectangle","x":80,"y":120,"w":180,"h":90,"text":"Start","style":{"fill":"#e5e9fc"}},
    {"id":"finish","type":"ellipse","x":400,"y":120,"w":180,"h":90,"text":"Finish","style":{"fill":"#dceee5"}},
    {"id":"connection","type":"arrow","x":260,"y":165,"w":140,"h":0,"from":"start","to":"finish","text":"next","style":{"routing":"elbow","fill":"transparent"}}
  ]
}
```

## Elements

Required: `id`, `type`, `x`, `y`, `w`, `h`. `text` defaults to an empty string. `style` may be omitted or partial. IDs start with a letter or underscore, followed by letters, digits, underscores, or hyphens; max 80 characters. All IDs must be unique.

| Type | Meaning |
| --- | --- |
| `rectangle` | Rounded box with centered, wrapped text |
| `ellipse` | Oval with centered text |
| `diamond` | Decision shape with centered text |
| `text` | Text only, wrapped within its width |
| `sticky` | Filled note with a folded corner |
| `arrow` | Connector with an arrowhead |
| `line` | Connector without an arrowhead |
| `draw` | Freehand polyline; requires `points` |
| `image` | Embedded picture; requires `src`, a base64 `data:image/png`, `image/jpeg`, `image/webp`, or `image/gif` URL |
| `group` | Labeled rectangular frame; members reference its ID through `groupId` |
| `pie` | Pie chart with labeled, colored numeric slices in `data` |
| `chart` | Line chart with numeric XY series in `data` |

Coordinates are canvas pixels, with x increasing right and y increasing down. Shapes require width and height of at least 20. A connector's fallback start is `(x,y)` and its end is `(x+w,y+h)`; connector widths and heights may be negative. Optional `from` and `to` reference node IDs. Attached endpoints follow node boundaries. To create a loose arrow omit both references. A drawing's `points` is a list of `[dx,dy]` pairs relative to its origin. Keep its bounding box consistent with its points. Rotation and nested groups are not supported. Flat groups use `groupId` as described below.

Text wraps automatically but is not clipped; size a shape to fit all lines. The array is also the paint order, from back to front. The validator returns normalized objects and ignores unknown properties. The editor permits at most 5,000 imported elements, 30,000 points per drawing, and board files up to 50 MB. Picture uploads accept PNG, JPEG, WebP, and GIF files up to 8 MB each. Image pixels are embedded in `src` so saved boards and exported SVGs remain portable. Images fit within their bounding box while preserving their aspect ratio; `text` holds an optional descriptive name. Opacity and layering apply to pictures.

## Style defaults and values

```json
{"stroke":"#303547","fill":"#e5e9fc","strokeWidth":2,"dash":"solid","fontSize":18,"opacity":1,"routing":"straight"}
```

- Colors: hex color or `transparent`. `stroke` also sets the text color.
- `strokeWidth`: 0–30; `fontSize`: 8–200; `opacity`: 0–1.
- `dash`: `solid`, `dashed`, `dotted`.
- `routing`: `straight`, `elbow`, `curve` (applies to connectors).
- Sticky notes ignore stroke width; text ignores fill; drawing ignores fill.

## One document, two ways to edit

The canvas and source editor use this same document. Open, Save board, and Download source all use `.redboard.json`. Stable element IDs, positions, styles, attached connectors, and freehand points survive a save/open round trip. Applying source is undoable. SVG export creates a static image for sharing; it is not an editable board file.

## Shared fields: exact contract

Every example below is an **element object**, to insert into the document's `elements` array. Supply unique IDs across that array. Defaults are filled in when opening or applying source.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable unique ID; see the ID rules above |
| `type` | Yes | One of the twelve types in the table above |
| `x`, `y` | Yes | Finite absolute canvas coordinates |
| `w`, `h` | Yes | Finite dimensions; at least 20 except connectors and drawings |
| `text` | No | Label/title, default empty; image description for pictures |
| `style` | No | Full or partial style object; see defaults above |
| `groupId` | No | ID of an existing `group`; coordinates remain absolute |

Numeric coordinates must be within ±10,000,000. Text is limited to 20,000 characters. The document name is limited to 200 characters. Unknown fields are not retained. Preserve an existing element's ID when editing it. References are case-sensitive.

## Rectangle (`rectangle`)

A rounded rectangle. `x,y` is its upper-left corner; `w,h` is its outer size. `text` is centered and wraps within the width minus 22 pixels. The corner radius is fixed at 10 pixels. Fill, stroke, stroke width, dashes, opacity, and font size apply. Routing is unused.

```json
{"id":"service","type":"rectangle","x":100,"y":100,"w":200,"h":100,"text":"Application service","style":{"fill":"#e5e9fc","stroke":"#303547","strokeWidth":2}}
```

## Ellipse (`ellipse`)

An oval inside the bounding box. Equal `w,h` values make a circle. Text is centered and wraps using the box width, so allow extra space to keep long labels away from curved edges. All shape style fields apply. Attached connectors meet the oval boundary.

```json
{"id":"finish","type":"ellipse","x":400,"y":100,"w":180,"h":100,"text":"Complete","style":{"fill":"#dceee5"}}
```

## Diamond (`diamond`)

Four vertices at the midpoints of the bounding box edges. Text wraps within 56% of the width. Use short labels and sufficient height. All shape style fields apply. Attached connectors meet the diamond boundary.

```json
{"id":"decision","type":"diamond","x":350,"y":260,"w":200,"h":150,"text":"Ready?","style":{"fill":"#fff0b8"}}
```

## Text (`text`)

Text without a visible box. The bounding box controls wrapping and vertical centering; use explicit `\n` for line breaks. `stroke` determines text color. `fontSize` and `opacity` apply. Fill, stroke width, dash, and routing do not affect text rendering. Text does not automatically enlarge the box or shrink to fit.

```json
{"id":"heading","type":"text","x":80,"y":30,"w":650,"h":65,"text":"System overview","style":{"stroke":"#303547","fontSize":32,"fill":"transparent"}}
```

## Sticky note (`sticky`)

A filled note with a folded lower-right corner and subtle shadow. Text wraps and is centered. Set `fill` explicitly for a yellow or other colored note. `stroke` colors the text; there is no visible outline. `fontSize` and `opacity` apply. Dash, stroke width, and routing are unused.

```json
{"id":"reminder","type":"sticky","x":80,"y":420,"w":240,"h":170,"text":"Remember\n\nReview the assumptions.","style":{"fill":"#fff0b8","stroke":"#7e693b","fontSize":16}}
```

## Arrow (`arrow`)

A connector with an arrowhead at its end. Its fallback start is `(x,y)` and fallback end is `(x+w,y+h)`. Negative width or height reverses the corresponding direction. `from` and `to` optionally name existing non-connector, non-drawing elements. Either endpoint may be attached independently. Attached endpoint geometry overrides the fallback position for that end and follows the referenced node.

`routing` accepts `straight`, `elbow` (horizontal–vertical–horizontal), or `curve` (cubic). Stroke, weight, dashes, opacity, and label font size apply; fill is ignored. `text` appears above the midpoint. Labels are single-line. Routing does not avoid obstacles automatically.

```json
{"id":"next","type":"arrow","x":300,"y":150,"w":100,"h":0,"from":"service","to":"finish","text":"success","style":{"stroke":"#438c78","fill":"transparent","routing":"elbow","dash":"dashed","fontSize":14}}
```

This example requires the `service` and `finish` elements. To make a free arrow, omit both references.

## Line (`line`)

The same endpoint rules, references, labels, and styles as `arrow`, with no arrowhead. Use it for dividers, associations, or annotation leaders. Both loose and attached lines survive save/open.

```json
{"id":"divider","type":"line","x":80,"y":380,"w":650,"h":0,"text":"","style":{"stroke":"#7e829b","strokeWidth":1,"dash":"dotted","routing":"straight"}}
```

## Freehand drawing (`draw`)

Requires `points`: 2–30,000 `[dx,dy]` pairs relative to `x,y`. Points are connected in their stored order. Set `w,h` to the drawing bounds; normally normalize points so their minimum X and Y are zero. Resizing scales the points. Stroke, weight, dashes, and opacity apply; fill, text, font size, and routing are unused. Drawings cannot be connector attachment targets.

```json
{"id":"underline","type":"draw","x":110,"y":210,"w":160,"h":12,"points":[[0,10],[35,2],[80,8],[120,0],[160,12]],"style":{"stroke":"#db594f","strokeWidth":3,"fill":"transparent"}}
```

## Picture (`image`)

Requires `src`: an embedded base64 data URL for PNG, JPEG, WebP, or GIF. Local paths and remote URLs are not accepted. `x,y,w,h` define the display box; pixels are centered in that box while preserving their original aspect ratio. `text` is descriptive metadata, not a visible caption. Only opacity affects image appearance; stroke and fill are unused. The same embedded pixels are included in SVG exports.

The tiny sample below is a valid one-pixel PNG; replace it with actual image bytes when creating a board.

```json
{"id":"picture","type":"image","x":80,"y":100,"w":240,"h":180,"text":"Reference picture","src":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=","style":{"opacity":1}}
```

## Group frame (`group`)

A rectangular frame with its title near the upper-left corner. Members are ordinary elements whose `groupId` equals the frame's ID. A group has no embedded `children` array. **Member coordinates are absolute**, so grouping never changes their coordinate system. Nested groups are rejected. Put the frame before its members in paint order, especially when using a fill.

Dragging the frame, nudging it with arrow keys, or changing its X/Y moves its members. Duplicating the group duplicates its members and remaps IDs and internal connections. Resize handles change only the frame, not its contents. Individual members remain selectable and movable. The Group button wraps selected elements with padding. Ungroup removes the frame and retains its contents. Deleting the frame also leaves its members on the board. Connections attached to a removed frame are removed.

```json
{"id":"backend","type":"group","x":60,"y":60,"w":550,"h":230,"text":"Backend","style":{"fill":"transparent","stroke":"#7e829b","dash":"dashed"}}
```

To include the rectangle example above, add `"groupId":"backend"` to `service`. Its `x:100,y:100` remains unchanged. Frames do not clip their contents or automatically grow when a member moves outside them. Use a transparent fill for an unobtrusive outline.

## Pie chart (`pie`)

Requires `data`, an array of 1–100 slices. Each slice has:

| Field | Meaning |
| --- | --- |
| `label` | Required string shown in the legend |
| `value` | Required finite nonnegative number; at least one slice must be positive |
| `color` | Required hex color or `transparent` |

The title is `text`. Slice values are normalized to their total; legend entries show labels, values, and rounded percentages. Zero slices have no wedge but remain in the legend. A single positive slice fills the circle. `fill` is the card background, `stroke` colors the title/legend and card outline, and opacity applies to the whole chart. Slice colors come from `data`. Use at least `440×320` for comfortable reading, and increase dimensions for longer legends. The chart scales to its bounding box.

```json
{"id":"allocation","type":"pie","x":80,"y":100,"w":440,"h":320,"text":"Time allocation","data":[{"label":"Design","value":45,"color":"#7e829b"},{"label":"Build","value":35,"color":"#db594f"},{"label":"Review","value":20,"color":"#438c78"}],"style":{"fill":"#ffffff","fontSize":18}}
```

## Line chart (`chart`)

Requires `data`, an array of 1–100 series. Each series has:

| Field | Meaning |
| --- | --- |
| `label` | Required legend label string |
| `color` | Required series hex color or `transparent` |
| `points` | Required array of 1–2,000 numeric `[x,y]` pairs |

Optional `xLabel` and `yLabel` default to empty strings. The title is `text`. Numeric axes use the minimum and maximum of all points across all series, with five tick marks per axis. Constant axes expand by ±1. Negative values are supported. Points connect in stored order; sort them by X for an ordinary time/progress line. One point is shown as a marker. There are no categorical/date axes or manual axis limits; represent dates numerically and describe units in the axis labels.

`fill` is the card background, `stroke` colors axes/text/outline, `strokeWidth` controls lines and outline, and `dash` styles series lines. Each series supplies its own color. Opacity applies to the whole chart. Use at least `440×320`, larger for many series. The chart scales to its bounding box.

```json
{"id":"progress","type":"chart","x":560,"y":100,"w":500,"h":350,"text":"Weekly progress","xLabel":"Week","yLabel":"Completed tasks","data":[{"label":"Planned","color":"#7e829b","points":[[1,10],[2,20],[3,30],[4,40]]},{"label":"Actual","color":"#db594f","points":[[1,8],[2,18],[3,27],[4,42]]}],"style":{"fill":"#ffffff","strokeWidth":2}}
```

Select a chart to edit its `data` array in the inspector and click **Apply data**. Edit its title using the normal text field. Axis labels can be edited in Source. Invalid data is rejected without changing the current chart. Charts remain native editable elements in the board file; SVG export contains their rendered paths, text, and markers.
