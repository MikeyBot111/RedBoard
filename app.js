/*
 * RedBoard editor: the canvas, tools, selection, history and file handling.
 * Everything lives in this IIFE; it relies on BoardFormat (format.js) for
 * validation/layout and BoardExtras (extras.js) for groups and charts.
 * The whole board is one `doc` object that is re-rendered to SVG on change.
 */
(() => {
    "use strict";
    // Shorthand helpers.
    const $ = (id) => document.getElementById(id),
        NS = "http://www.w3.org/2000/svg",
        F = BoardFormat;
    // Deep copy (elements are plain JSON).
    const clone = (o) => JSON.parse(JSON.stringify(o));
    // Create an SVG element with attributes and optionally append it to parent.
    const svg = (tag, attrs = {}, parent) => {
        const e = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        if (parent) parent.append(e);
        return e;
    };
    // Toolbar icons as 24x24 SVG path data, in toolbar order.
    const icons = {
        select: "M5 3l14 10-7 1-4 7z",
        hand: "M8 12V6a2 2 0 014 0v5-7a2 2 0 014 0v7-5a2 2 0 014 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-2-3a2 2 0 013-2l1 1",
        rectangle: "M4 5h16v14H4z",
        diamond: "M12 2l10 10-10 10L2 12z",
        ellipse: "M21 12a9 9 0 11-18 0 9 9 0 0118 0",
        arrow: "M3 20L20 3M9 3h11v11",
        line: "M4 20L20 4",
        draw: "M3 18c4-15 7-15 5-5s5 6 8-1 5-2 5 3",
        text: "M4 5h16M12 5v16M8 21h8",
        sticky: "M4 3h16v12l-6 6H4zM14 21v-6h6",
    };
    // Single-key shortcuts for each tool.
    const shortcuts = {
        select: "V",
        hand: "H",
        rectangle: "R",
        diamond: "D",
        ellipse: "O",
        arrow: "A",
        line: "L",
        draw: "P",
        text: "T",
        sticky: "N",
    };
    // Editor state.
    //   doc          the current board document
    //   selected     IDs of selected elements
    //   tool         active tool name
    //   currentStyle style used for newly created elements
    //   view         pan offset (x, y) and zoom (z)
    //   gesture      the pointer drag in progress (pan/move/resize/create/marquee)
    //   space        whether Space is held (temporary pan)
    //   history/future  undo and redo stacks of serialized docs
    //   editing      ID of the element whose text is being edited
    //   sourceDirty  true when the source panel has unapplied edits
    //   lastClick    previous click, used to detect double-clicks
    let doc,
        selected = new Set(),
        tool = "select",
        currentStyle = {
            ...F.defaults
        },
        view = {
            x: 0,
            y: 0,
            z: 1
        },
        gesture = null,
        space = false,
        history = [],
        future = [],
        editing = null,
        sourceDirty = false,
        toastTimer,
        lastClick = null;
    const canvas = $("canvas"),
        workspace = $("workspace");
    // Generate a new element ID (valid per the format's ID rules).
    function uid() {
        return (
            "e_" +
            (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
            .replace(/-/g, "")
            .slice(0, 18)
        );
    }
    // Build a basic element with default style.
    const node = (id, type, x, y, w, h, text, fill) => ({
        id,
        type,
        x,
        y,
        w,
        h,
        text,
        style: {
            ...F.defaults,
            fill: fill || F.defaults.fill
        },
    });
    // The example board shown on first launch.
    function demo() {
        return {
            format: "redboard",
            version: 1,
            name: "A little space for big ideas",
            elements: [
                node(
                    "heading",
                    "text",
                    80,
                    60,
                    550,
                    58,
                    "Good ideas start with a little mess.",
                    "transparent",
                ),
                {
                    ...node(
                        "subtitle",
                        "text",
                        80,
                        121,
                        520,
                        30,
                        "Sketch freely. Connect the dots. Make something click.",
                        "transparent",
                    ),
                    style: {
                        ...F.defaults,
                        fontSize: 14,
                        stroke: "#91939c",
                        fill: "transparent",
                    },
                },
                node(
                    "idea",
                    "rectangle",
                    90,
                    238,
                    180,
                    90,
                    "A spark of an idea",
                    "#e9e8fa",
                ),
                node("question", "diamond", 355, 212, 170, 142, "What if?", "#ffefcd"),
                node(
                    "make",
                    "rectangle",
                    610,
                    238,
                    185,
                    90,
                    "Make it happen",
                    "#dceee5",
                ),
                {
                    ...node("edge_idea", "arrow", 270, 283, 85, 0, "", "transparent"),
                    from: "idea",
                    to: "question",
                    style: {
                        ...F.defaults,
                        fill: "transparent",
                        routing: "elbow"
                    },
                },
                {
                    ...node(
                        "edge_make",
                        "arrow",
                        525,
                        283,
                        85,
                        0,
                        "yes, and…",
                        "transparent",
                    ),
                    from: "question",
                    to: "make",
                    style: {
                        ...F.defaults,
                        fill: "transparent",
                        routing: "elbow",
                        fontSize: 14,
                    },
                },
                {
                    ...node(
                        "note",
                        "sticky",
                        107,
                        415,
                        224,
                        155,
                        "A reminder\n\nIt doesn’t have to be perfect.\nIt just has to start.",
                        "#fff0b8",
                    ),
                    style: {
                        ...F.defaults,
                        fill: "#fff0b8",
                        stroke: "#7e693b",
                        fontSize: 16,
                        strokeWidth: 1,
                    },
                },
                {
                    ...node(
                        "footer",
                        "text",
                        415,
                        430,
                        350,
                        95,
                        "Your next big thing\nstarts right here.",
                        "transparent",
                    ),
                    style: {
                        ...F.defaults,
                        fill: "transparent",
                        fontSize: 24,
                        stroke: "#7e829b",
                    },
                },
                {
                    ...node("scribble", "draw", 448, 529, 238, 18, "", "transparent"),
                    points: [
                        [0, 9],
                        [30, 4],
                        [70, 7],
                        [110, 1],
                        [160, 6],
                        [199, 3],
                        [238, 8],
                    ],
                    style: {
                        ...F.defaults,
                        fill: "transparent",
                        stroke: "#d98477",
                        strokeWidth: 3,
                    },
                },
            ],
        };
    }
    // Show a short message at the bottom of the screen.
    function toast(message) {
        $("toast").textContent = message;
        $("toast").classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3500);
    }
    // ---- Persistence and undo history ----

    // Autosave the board to localStorage.
    let storageWarned = false;

    function persist() {
        try {
            localStorage.setItem("redboard-v1", JSON.stringify(doc));
            storageWarned = false;
        } catch {
            // Storage is full or blocked: warn once instead of on every edit.
            if (!storageWarned) toast("Browser storage is unavailable. Save a file to keep this board.");
            storageWarned = true;
        }
    }
    // Record the current state before a change (keeps the last 100 steps).
    function checkpoint() {
        history.push(JSON.stringify(doc));
        if (history.length > 100) history.shift();
        future = [];
    }
    // Apply a change: autosave, redraw, refresh the inspector and source panel.
    function commit() {
        persist();
        render();
        updateInspector();
        if (!$("sourcePanel").hidden && !sourceDirty) refreshSource();
    }
    // Undo, or redo when redo is true, by swapping states between the stacks.
    function undo(redo = false) {
        finishText();
        const src = redo ? future : history,
            dst = redo ? history : future;
        if (!src.length) return;
        dst.push(JSON.stringify(doc));
        doc = JSON.parse(src.pop());
        selected.clear();
        $("boardName").value = doc.name;
        commit();
    }
    // ---- Geometry helpers ----

    // Find an element by ID.
    function get(id) {
        return doc.elements.find((e) => e.id === id);
    }
    // Center point of an element.
    function center(e) {
        return {
            x: e.x + e.w / 2,
            y: e.y + e.h / 2
        };
    }
    // Point where a line from the center of n toward `toward` crosses n's
    // outline (handles ellipses, diamonds and rectangles). Used so attached
    // connectors stop at the shape's edge instead of its center.
    function boundary(n, toward) {
        const c = center(n),
            dx = toward.x - c.x,
            dy = toward.y - c.y;
        let k;
        if (!dx && !dy) return {
            x: c.x + n.w / 2,
            y: c.y
        };
        if (n.type === "ellipse")
            k = 1 / Math.sqrt((dx / (n.w / 2)) ** 2 + (dy / (n.h / 2)) ** 2);
        else if (n.type === "diamond")
            k = 1 / (Math.abs(dx) / (n.w / 2) + Math.abs(dy) / (n.h / 2));
        else
            k = Math.min(
                dx ? Math.abs(n.w / 2 / dx) : Infinity,
                dy ? Math.abs(n.h / 2 / dy) : Infinity,
            );
        return {
            x: c.x + dx * k,
            y: c.y + dy * k
        };
    }
    // Start and end points of a connector. Attached ends snap to the node edges;
    // loose ends use the element's own x/y and x+w/y+h.
    function ends(e) {
        let a = {
                x: e.x,
                y: e.y
            },
            b = {
                x: e.x + e.w,
                y: e.y + e.h
            };
        const from = get(e.from),
            to = get(e.to);
        if (from) a = center(from);
        if (to) b = center(to);
        const a0 = {
            ...a
        };
        if (from) a = boundary(from, b);
        if (to) b = boundary(to, a0);
        return [a, b];
    }
    // Bounding box of an element (connectors use their resolved end points).
    function bounds(e) {
        if (["arrow", "line"].includes(e.type)) {
            const [a, b] = ends(e);
            return {
                x: Math.min(a.x, b.x),
                y: Math.min(a.y, b.y),
                w: Math.abs(a.x - b.x),
                h: Math.abs(a.y - b.y),
            };
        }
        return {
            x: e.x,
            y: e.y,
            w: e.w,
            h: e.h
        };
    }
    // Bounding box around several elements (default: the whole board).
    function allBounds(elements = doc.elements) {
        if (!elements.length) return {
            x: 0,
            y: 0,
            w: 800,
            h: 600
        };
        const bs = elements.map(bounds),
            x = Math.min(...bs.map((b) => b.x)),
            y = Math.min(...bs.map((b) => b.y));
        return {
            x,
            y,
            w: Math.max(...bs.map((b) => b.x + b.w)) - x,
            h: Math.max(...bs.map((b) => b.y + b.h)) - y,
        };
    }
    // Word-wrap text to at most `max` characters per line, splitting words
    // that are longer than a line.
    function textLines(text, max) {
        return text.split("\n").flatMap((line) => {
            if (!line) return [""];
            const out = [];
            let row = "";
            for (const word of line.split(" ")) {
                if (row.length + word.length > max && row) {
                    out.push(row);
                    row = "";
                }
                if (word.length > max) {
                    if (row) {
                        out.push(row);
                        row = "";
                    }
                    for (let i = 0; i < word.length; i += max)
                        out.push(word.slice(i, i + max));
                } else row += (row ? " " : "") + word;
            }
            if (row) out.push(row);
            return out;
        });
    }
    // ---- Rendering ----

    // Draw one element as an SVG <g>. When exporting, invisible hit areas used
    // for clicking on the canvas are left out.
    function drawElement(e, parent, exporting = false) {
        const s = e.style,
            g = svg("g", {
                "data-id": e.id,
                opacity: s.opacity
            }, parent);
        const attrs = {
            stroke: s.stroke,
            "stroke-width": s.strokeWidth,
            fill: s.fill,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        };
        // Dash patterns: dashed = 9 on / 7 off, dotted = round dots 7 apart.
        if (s.dash !== "solid")
            attrs["stroke-dasharray"] = s.dash === "dashed" ? "9 7" : "1 7";
        const conn = ["arrow", "line"].includes(e.type);
        // Groups and charts are drawn by extras.js.
        if (["group", "pie", "chart"].includes(e.type)) {
            BoardExtras.render(e, g, svg);
        } else if (conn) {
            const [a, b] = ends(e);
            // Connector path: straight by default, or elbow / curve routing.
            // ang is the arrowhead direction at the end point.
            let d = `M${a.x} ${a.y} L${b.x} ${b.y}`,
                ang = Math.atan2(b.y - a.y, b.x - a.x),
                label = {
                    x: (a.x + b.x) / 2,
                    y: (a.y + b.y) / 2
                };
            if (s.routing === "elbow") {
                const mx = (a.x + b.x) / 2;
                d = `M${a.x} ${a.y} H${mx} V${b.y} H${b.x}`;
                ang = b.x >= a.x ? 0 : Math.PI;
            }
            if (s.routing === "curve") {
                const mx = (a.x + b.x) / 2;
                d = `M${a.x} ${a.y} C${mx} ${a.y},${mx} ${b.y},${b.x} ${b.y}`;
                ang = b.x >= a.x ? 0 : Math.PI;
            }
            // Wide invisible stroke so thin lines are easy to click.
            if (!exporting)
                svg(
                    "path", {
                        d,
                        fill: "none",
                        stroke: "transparent",
                        "stroke-width": 18
                    },
                    g,
                );
            svg("path", {
                ...attrs,
                d,
                fill: "none"
            }, g);
            // Arrowhead: two short strokes at ±0.43 rad from the line direction.
            if (e.type === "arrow") {
                const len = 11 + s.strokeWidth;
                svg(
                    "path", {
                        ...attrs,
                        fill: "none",
                        d: `M${b.x - len * Math.cos(ang - 0.43)} ${b.y - len * Math.sin(ang - 0.43)} L${b.x} ${b.y} L${b.x - len * Math.cos(ang + 0.43)} ${b.y - len * Math.sin(ang + 0.43)}`,
                    },
                    g,
                );
            }
            // Connector label at the midpoint, with a background-colored outline
            // so it stays readable over the line.
            if (e.text) {
                const t = svg(
                    "text", {
                        x: label.x,
                        y: label.y - 12,
                        "text-anchor": "middle",
                        "font-family": "Segoe UI, sans-serif",
                        "font-size": s.fontSize,
                        fill: s.stroke,
                        stroke: "#fbfaf8",
                        "stroke-width": 5,
                        "paint-order": "stroke",
                    },
                    g,
                );
                t.textContent = e.text;
            }
        } else if (e.type === "image") {
            svg(
                "image", {
                    x: e.x,
                    y: e.y,
                    width: e.w,
                    height: e.h,
                    href: e.src,
                    preserveAspectRatio: "xMidYMid meet",
                },
                g,
            );
        } else if (e.type === "draw") {
            svg(
                "path", {
                    ...attrs,
                    fill: "none",
                    d: e.points
                        .map((p, i) => `${i ? "L" : "M"}${e.x + p[0]} ${e.y + p[1]}`)
                        .join(" "),
                },
                g,
            );
            // Wide invisible stroke so freehand lines are easy to click.
            if (!exporting)
                svg(
                    "path", {
                        fill: "none",
                        stroke: "transparent",
                        "stroke-width": 15,
                        d: e.points
                            .map((p, i) => `${i ? "L" : "M"}${e.x + p[0]} ${e.y + p[1]}`)
                            .join(" "),
                    },
                    g,
                );
        } else {
            if (e.type === "rectangle")
                svg(
                    "rect", {
                        ...attrs,
                        x: e.x,
                        y: e.y,
                        width: e.w,
                        height: e.h,
                        rx: 10
                    },
                    g,
                );
            if (e.type === "ellipse")
                svg(
                    "ellipse", {
                        ...attrs,
                        cx: e.x + e.w / 2,
                        cy: e.y + e.h / 2,
                        rx: e.w / 2,
                        ry: e.h / 2,
                    },
                    g,
                );
            if (e.type === "diamond")
                svg(
                    "polygon", {
                        ...attrs,
                        points: `${e.x + e.w / 2},${e.y} ${e.x + e.w},${e.y + e.h / 2} ${e.x + e.w / 2},${e.y + e.h} ${e.x},${e.y + e.h / 2}`,
                    },
                    g,
                );
            // Sticky note: soft shadow, note body with a cut corner, and the fold.
            if (e.type === "sticky") {
                svg(
                    "rect", {
                        x: e.x + 3,
                        y: e.y + 5,
                        width: e.w,
                        height: e.h,
                        rx: 2,
                        fill: "#3035470c",
                    },
                    g,
                );
                svg(
                    "path", {
                        ...attrs,
                        stroke: "none",
                        d: `M${e.x} ${e.y} H${e.x + e.w} V${e.y + e.h - 20} L${e.x + e.w - 20} ${e.y + e.h} H${e.x} Z`,
                    },
                    g,
                );
                svg(
                    "path", {
                        d: `M${e.x + e.w - 20} ${e.y + e.h} V${e.y + e.h - 20} H${e.x + e.w}`,
                        fill: "#00000010",
                    },
                    g,
                );
            }
            // Invisible box so text elements can be clicked anywhere inside them.
            if (e.type === "text" && !exporting)
                svg(
                    "rect", {
                        x: e.x,
                        y: e.y,
                        width: e.w,
                        height: e.h,
                        fill: "transparent"
                    },
                    g,
                );
            // Centered, wrapped label (hidden while it is being edited inline).
            // Characters per line are estimated from the font size; diamonds have
            // less usable width.
            if (e.text && editing !== e.id) {
                const usable = e.type === "diamond" ? e.w * 0.56 : e.w - 22,
                    lines = textLines(
                        e.text,
                        Math.max(3, Math.floor(usable / (s.fontSize * 0.54))),
                    ),
                    lineH = s.fontSize * 1.35;
                const t = svg(
                    "text", {
                        x: e.x + e.w / 2,
                        y: e.y + e.h / 2 - ((lines.length - 1) * lineH) / 2,
                        "text-anchor": "middle",
                        "dominant-baseline": "central",
                        "font-family": "Segoe UI, sans-serif",
                        "font-size": s.fontSize,
                        fill: s.stroke,
                    },
                    g,
                );
                lines.forEach((line, i) => {
                    const sp = svg("tspan", {
                        x: e.x + e.w / 2,
                        dy: i ? lineH : 0
                    }, t);
                    sp.textContent = line;
                });
            }
        }
        return g;
    }
    // Redraw the whole canvas: dotted background, all elements in paint order,
    // selection outlines and handles, and the marquee box.
    function render() {
        canvas.replaceChildren();
        const defs = svg("defs", {}, canvas),
            pattern = svg(
                "pattern", {
                    id: "dots",
                    width: 24 * view.z,
                    height: 24 * view.z,
                    patternUnits: "userSpaceOnUse",
                    x: view.x,
                    y: view.y,
                },
                defs,
            );
        svg("circle", {
            cx: 1,
            cy: 1,
            r: 1,
            fill: "#dbd9d5"
        }, pattern);
        svg("rect", {
            width: "100%",
            height: "100%",
            fill: "url(#dots)"
        }, canvas);
        // All elements live in one group that applies the pan/zoom transform.
        const scene = svg(
            "g", {
                transform: `translate(${view.x} ${view.y}) scale(${view.z})`
            },
            canvas,
        );
        doc.elements.forEach((e) => drawElement(e, scene));
        // Selection outline (dashed when several elements are selected). Sizes are
        // divided by the zoom so outlines and handles stay the same size on screen.
        selected.forEach((id) => {
            const e = get(id);
            if (!e) return;
            const b = bounds(e);
            svg(
                "rect", {
                    x: b.x - 6 / view.z,
                    y: b.y - 6 / view.z,
                    width: Math.max(1, b.w) + 12 / view.z,
                    height: Math.max(1, b.h) + 12 / view.z,
                    rx: 3 / view.z,
                    fill: "none",
                    stroke: "#db594f",
                    "stroke-width": 1 / view.z,
                    "stroke-dasharray": selected.size > 1 ? "5 4" : "none",
                    "pointer-events": "none",
                },
                scene,
            );
            // Handles for a single selection: end points for connectors, corners otherwise.
            if (selected.size === 1) {
                if (["arrow", "line"].includes(e.type)) {
                    ends(e).forEach((p, i) =>
                        svg(
                            "circle", {
                                cx: p.x,
                                cy: p.y,
                                r: 5 / view.z,
                                fill: "white",
                                stroke: "#db594f",
                                "stroke-width": 1.5 / view.z,
                                "data-handle": i ? "end" : "start",
                                "data-id": id,
                            },
                            scene,
                        ),
                    );
                } else
                    for (const [name, x, y] of [
                            ["nw", b.x, b.y],
                            ["ne", b.x + b.w, b.y],
                            ["sw", b.x, b.y + b.h],
                            ["se", b.x + b.w, b.y + b.h],
                        ])
                        svg(
                            "rect", {
                                x: x - 4 / view.z,
                                y: y - 4 / view.z,
                                width: 8 / view.z,
                                height: 8 / view.z,
                                fill: "white",
                                stroke: "#db594f",
                                "stroke-width": 1 / view.z,
                                "data-handle": name,
                                "data-id": id,
                            },
                            scene,
                        );
            }
        });
        // Selection box while dragging on empty canvas.
        if (gesture?.kind === "marquee") {
            const a = gesture.start,
                b = gesture.last;
            svg(
                "rect", {
                    x: Math.min(a.x, b.x),
                    y: Math.min(a.y, b.y),
                    width: Math.abs(a.x - b.x),
                    height: Math.abs(a.y - b.y),
                    fill: "#db594f0c",
                    stroke: "#db594f",
                    "stroke-width": 1 / view.z,
                },
                scene,
            );
        }
        // Keep the zoom label, undo/redo buttons and cursor in sync.
        $("zoomReset").textContent = Math.round(view.z * 100) + "%";
        $("undo").disabled = !history.length;
        $("redo").disabled = !future.length;
        canvas.style.cursor =
            space || tool === "hand" ?
            "grab" :
            tool === "select" ?
            "default" :
            tool === "text" ?
            "text" :
            "crosshair";
    }
    // Refresh the left panel to show the selected element's properties, or the
    // style for new elements when nothing is selected.
    function updateInspector() {
        const e = selected.size === 1 ? get([...selected][0]) : null,
            s = e?.style || currentStyle;
        // The title names the selection; it is hidden when nothing is selected.
        $("selectionTitle").hidden = !selected.size;
        $("selectionTitle").textContent = e ?
            e.type.charAt(0).toUpperCase() + e.type.slice(1) :
            selected.size ?
            `${selected.size} selected` :
            "";
        $("elementFields").hidden = !e;
        $("chartFields").hidden = !e || !["pie", "chart"].includes(e.type);
        if (e && ["pie", "chart"].includes(e.type))
            $("chartData").value = JSON.stringify(e.data, null, 2);
        if (e) {
            $("elementText").value = e.text;
            for (const [key, field] of [
                    ["x", "elementX"],
                    ["y", "elementY"],
                    ["w", "elementW"],
                    ["h", "elementH"],
                ]) {
                $(field).value = Math.round(e[key]);
                $(field).disabled = ["arrow", "line", "draw"].includes(e.type);
            }
        }
        for (const key of [
                "stroke",
                "fill",
                "strokeWidth",
                "dash",
                "fontSize",
                "routing",
            ]) {
            if (key === "stroke" || key === "fill") {
                if (/^#[a-f0-9]{6}$/i.test(s[key])) $(key).value = s[key];
            } else $(key).value = s[key];
        }
        $("opacity").value = s.opacity * 100;
        $("opacityValue").textContent = Math.round(s.opacity * 100) + "%";
        document
            .querySelectorAll(".swatch")
            .forEach((b) =>
                b.classList.toggle("selected", s[b.dataset.prop] === b.dataset.color),
            );
        for (const id of ["delete", "duplicate", "toFront", "toBack"])
            $(id).disabled = !selected.size;
    }
    // Switch the active tool and update the hint at the bottom of the canvas.
    function setTool(t) {
        finishText();
        tool = t;
        document
            .querySelectorAll(".tool")
            .forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
        $("canvasHint").textContent =
            t === "select" ?
            "Drag to select · Double-click to edit text · Space to pan" :
            t === "arrow" || t === "line" ?
            "Drag from one shape to another to create a connected line" :
            t === "hand" ?
            "Drag to move around your canvas" :
            "Click and drag to create · Escape to select";
        render();
    }
    // ---- View, selection and editing helpers ----

    // Convert a pointer event's screen position to board coordinates.
    function point(ev) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (ev.clientX - r.left - view.x) / view.z,
            y: (ev.clientY - r.top - view.y) / view.z,
        };
    }
    // Topmost shape under point p (connectors and drawings are ignored).
    // Used to attach connector ends.
    function nodeAt(p, excluded) {
        return [...doc.elements]
            .reverse()
            .find(
                (e) =>
                e.id !== excluded &&
                !["arrow", "line", "draw"].includes(e.type) &&
                p.x >= e.x &&
                p.y >= e.y &&
                p.x <= e.x + e.w &&
                p.y <= e.y + e.h,
            );
    }
    // Zoom and pan so the whole board fits on screen (zoom limited to 10%–140%).
    function fit() {
        const b = allBounds(),
            r = canvas.getBoundingClientRect();
        view.z = Math.max(
            0.1,
            Math.min(
                1.4,
                (r.width - 110) / Math.max(b.w, 100),
                (r.height - 220) / Math.max(b.h, 100),
            ),
        );
        view.x = (r.width - b.w * view.z) / 2 - b.x * view.z;
        view.y = (r.height - b.h * view.z) / 2 - b.y * view.z + 10;
        render();
    }
    // Zoom by factor f around screen point (cx, cy), keeping that point still.
    function zoom(f, cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2) {
        const old = view.z;
        view.z = Math.max(0.1, Math.min(4, old * f));
        view.x = cx - ((cx - view.x) * view.z) / old;
        view.y = cy - ((cy - view.y) * view.z) / old;
        render();
    }
    // Selected IDs plus the members of any selected group (they move together).
    function movingIds() {
        const ids = new Set(selected);
        doc.elements.forEach((e) => {
            if (e.groupId && selected.has(e.groupId)) ids.add(e.id);
        });
        return ids;
    }
    // Delete the selection, plus connectors attached to deleted elements.
    // Members of a deleted group are kept but ungrouped.
    function remove() {
        if (!selected.size) return;
        checkpoint();
        doc.elements = doc.elements.filter(
            (e) =>
            !selected.has(e.id) && !selected.has(e.from) && !selected.has(e.to),
        );
        doc.elements.forEach((e) => {
            if (e.groupId && !get(e.groupId)) delete e.groupId;
        });
        selected.clear();
        commit();
    }
    // Copy the selection (and group members) 25px down-right with new IDs.
    // Connections and group links inside the copy point at the copied elements.
    function duplicate() {
        if (!selected.size) return;
        checkpoint();
        const ids = movingIds();
        const map = new Map([...ids].map((id) => [id, uid()]));
        const added = doc.elements
            .filter((e) => ids.has(e.id))
            .map((e) => {
                const n = clone(e);
                n.id = map.get(e.id);
                if (n.groupId) n.groupId = map.get(n.groupId) || n.groupId;
                n.x += 25;
                n.y += 25;
                if (n.from) n.from = map.get(n.from) || n.from;
                if (n.to) n.to = map.get(n.to) || n.to;
                return n;
            });
        doc.elements.push(...added);
        selected = new Set(added.map((e) => e.id));
        commit();
    }
    // Open the inline text editor over an element, scaled to the current zoom.
    function editText(e) {
        if (!e || ["draw", "image"].includes(e.type)) return;
        finishText();
        editing = e.id;
        const b = bounds(e),
            input = $("inlineText");
        input.hidden = false;
        input.value = e.text;
        input.style.left = b.x * view.z + view.x + "px";
        input.style.top = b.y * view.z + view.y + "px";
        input.style.width = Math.max(120, b.w * view.z) + "px";
        input.style.height = Math.max(65, b.h * view.z) + "px";
        input.style.fontSize = e.style.fontSize * view.z + "px";
        input.focus();
        input.select();
        render();
    }
    // Close the inline editor and save the text, unless cancelled (Escape).
    function finishText(cancel = false) {
        if (!editing) return;
        const e = get(editing);
        if (e && !cancel && e.text !== $("inlineText").value) {
            checkpoint();
            e.text = $("inlineText").value;
        }
        editing = null;
        $("inlineText").hidden = true;
        commit();
    }
    // ---- Pointer input ----
    // pointerdown starts a gesture, pointermove updates it, pointerup finishes it.
    canvas.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0 && ev.button !== 1) return;
        finishText();
        canvas.focus();
        ev.preventDefault();
        canvas.setPointerCapture(ev.pointerId);
        const p = point(ev),
            hit = ev.target.closest("[data-id]"),
            id = hit?.dataset.id,
            handle = ev.target.dataset.handle;
        // Pan with the hand tool, Space+drag or the middle mouse button.
        if (space || tool === "hand" || ev.button === 1) {
            gesture = {
                kind: "pan",
                screen: {
                    x: ev.clientX,
                    y: ev.clientY
                },
                view: {
                    ...view
                },
            };
            return;
        }
        // Select tool: double-click, resize, move or marquee select.
        if (tool === "select") {
            // Double-click: edit the element's text, or add a text box on empty canvas.
            const now = performance.now();
            if (
                !handle &&
                !ev.shiftKey &&
                lastClick &&
                lastClick.id === id &&
                now - lastClick.time < 400 &&
                Math.hypot(p.x - lastClick.x, p.y - lastClick.y) * view.z < 6
            ) {
                lastClick = null;
                gesture = null;
                if (id) editText(get(id));
                else {
                    checkpoint();
                    const e = node(
                        uid(),
                        "text",
                        p.x - 100,
                        p.y - 25,
                        200,
                        50,
                        "",
                        "transparent",
                    );
                    e.style = {
                        ...currentStyle,
                        fill: "transparent"
                    };
                    doc.elements.push(e);
                    selected = new Set([e.id]);
                    editText(e);
                }
                return;
            }
            lastClick = {
                id,
                time: now,
                ...p
            };
            // Otherwise start resizing (handle), moving (element; Shift toggles it in
            // the selection) or a marquee selection (empty canvas).
            if (handle) {
                checkpoint();
                gesture = {
                    kind: "resize",
                    id,
                    handle,
                    start: p,
                    original: clone(get(id)),
                };
            } else if (id) {
                if (ev.shiftKey) {
                    if (selected.has(id)) selected.delete(id);
                    else selected.add(id);
                } else if (!selected.has(id)) selected = new Set([id]);
                gesture = {
                    kind: "move",
                    start: p,
                    original: doc.elements
                        .filter((e) => movingIds().has(e.id))
                        .map(clone),
                    recorded: false,
                };
            } else {
                if (!ev.shiftKey) selected.clear();
                gesture = {
                    kind: "marquee",
                    start: p,
                    last: p,
                    previous: new Set(selected),
                };
            }
            updateInspector();
            render();
            return;
        }
        checkpoint();
        // Any drawing tool: create the element at the pointer; dragging sizes it.
        const e = {
            id: uid(),
            type: tool,
            x: p.x,
            y: p.y,
            w: 0,
            h: 0,
            text: "",
            style: {
                ...currentStyle
            },
        };
        // Tool-specific defaults for new elements.
        if (tool === "sticky") {
            e.style.fill =
                currentStyle.fill === "transparent" ? "#fff0b8" : currentStyle.fill;
            e.style.strokeWidth = 1;
        }
        if (tool === "text") e.style.fill = "transparent";
        if (["arrow", "line", "draw"].includes(tool)) e.style.fill = "transparent";
        if (tool === "draw")
            e.points = [
                [0, 0],
                [0, 0],
            ];
        // Start a connector attached to the shape under the pointer, if any.
        if (["arrow", "line"].includes(tool)) {
            const n = nodeAt(p);
            if (n) e.from = n.id;
        }
        doc.elements.push(e);
        selected = new Set([e.id]);
        gesture = {
            kind: "create",
            id: e.id,
            start: p
        };
        render();
    });
    // Update the gesture in progress.
    canvas.addEventListener("pointermove", (ev) => {
        if (!gesture) return;
        const p = point(ev),
            g = gesture;
        if (g.kind === "pan") {
            // Pan: move the view with the pointer.
            view.x = g.view.x + ev.clientX - g.screen.x;
            view.y = g.view.y + ev.clientY - g.screen.y;
        } else if (g.kind === "marquee") {
            // Marquee: select every element that lies fully inside the box.
            g.last = p;
            const box = {
                x: Math.min(g.start.x, p.x),
                y: Math.min(g.start.y, p.y),
                w: Math.abs(p.x - g.start.x),
                h: Math.abs(p.y - g.start.y),
            };
            selected = new Set(g.previous);
            doc.elements.forEach((e) => {
                const b = bounds(e);
                if (
                    b.x >= box.x &&
                    b.y >= box.y &&
                    b.x + b.w <= box.x + box.w &&
                    b.y + b.h <= box.y + box.h
                )
                    selected.add(e.id);
            });
        } else if (g.kind === "move") {
            const dx = p.x - g.start.x,
                dy = p.y - g.start.y;
            // Move: record an undo step only once the pointer actually moves.
            if (!g.recorded && Math.abs(dx) + Math.abs(dy) > 1) {
                checkpoint();
                g.recorded = true;
            }
            if (g.recorded)
                g.original.forEach((o) => {
                    const e = get(o.id);
                    e.x = o.x + dx;
                    e.y = o.y + dy;
                });
        } else if (g.kind === "create") {
            const e = get(g.id);
            let dx = p.x - g.start.x,
                dy = p.y - g.start.y;
            // Create: Shift keeps shapes square. Drawings add points, connectors
            // stretch and attach their end to the shape under the pointer, and other
            // shapes grow from the start point in any direction.
            if (ev.shiftKey && !["draw", "arrow", "line"].includes(e.type)) {
                dx = Math.sign(dx || 1) * Math.max(Math.abs(dx), Math.abs(dy));
                dy = Math.sign(dy || 1) * Math.abs(dx);
            }
            if (e.type === "draw") {
                e.points.push([dx, dy]);
            } else if (["arrow", "line"].includes(e.type)) {
                e.w = dx;
                e.h = dy;
                const n = nodeAt(p, e.from);
                if (n) e.to = n.id;
                else delete e.to;
            } else {
                e.x = g.start.x + Math.min(0, dx);
                e.y = g.start.y + Math.min(0, dy);
                e.w = Math.abs(dx);
                e.h = Math.abs(dy);
            }
        } else if (g.kind === "resize") {
            const e = get(g.id),
                o = g.original;
            // Resize: connector end handles move and re-attach that end; corner
            // handles resize (minimum 20px) and scale freehand points to match.
            if (g.handle === "start" || g.handle === "end") {
                const [a, b] = ends(e),
                    n = nodeAt(p, g.handle === "start" ? e.to : e.from);
                if (g.handle === "start") {
                    e.x = p.x;
                    e.y = p.y;
                    e.w = b.x - p.x;
                    e.h = b.y - p.y;
                    if (n) e.from = n.id;
                    else delete e.from;
                } else {
                    e.x = a.x;
                    e.y = a.y;
                    e.w = p.x - a.x;
                    e.h = p.y - a.y;
                    if (n) e.to = n.id;
                    else delete e.to;
                }
            } else {
                const west = g.handle.includes("w"),
                    north = g.handle.includes("n");
                e.x = west ? Math.min(p.x, o.x + o.w - 20) : o.x;
                e.y = north ? Math.min(p.y, o.y + o.h - 20) : o.y;
                e.w = west ? o.x + o.w - e.x : Math.max(20, p.x - o.x);
                e.h = north ? o.y + o.h - e.y : Math.max(20, p.y - o.y);
                if (e.type === "draw")
                    e.points = o.points.map(([x, y]) => [
                        (x * e.w) / (o.w || 1),
                        (y * e.h) / (o.h || 1),
                    ]);
            }
        }
        render();
    });
    // Finish the gesture. New drawings get their bounding box normalized,
    // shapes that were only clicked (not dragged) get a default size, and new
    // text and sticky notes open straight into text editing.
    function pointerEnd() {
        if (!gesture) return;
        const g = gesture;
        gesture = null;
        if (g.kind === "create") {
            const e = get(g.id);
            if (e.type === "draw") {
                const xs = e.points.map((p) => p[0]),
                    ys = e.points.map((p) => p[1]),
                    minX = Math.min(...xs),
                    minY = Math.min(...ys);
                e.x += minX;
                e.y += minY;
                e.w = Math.max(1, Math.max(...xs) - minX);
                e.h = Math.max(1, Math.max(...ys) - minY);
                e.points = e.points.map(([x, y]) => [x - minX, y - minY]);
            } else if (!["arrow", "line"].includes(e.type)) {
                if (e.w < 20 || e.h < 20) {
                    e.w = e.type === "sticky" ? 200 : e.type === "text" ? 240 : 160;
                    e.h = e.type === "sticky" ? 150 : e.type === "text" ? 50 : 90;
                }
            } else if (Math.abs(e.w) + Math.abs(e.h) < 10) {
                e.w = 150;
                e.h = 0;
            }
            if (["text", "sticky"].includes(e.type)) {
                setTool("select");
                editText(e);
            } else setTool("select");
        }
        commit();
    }
    // Finish on pointer up/cancel. The mouse wheel zooms around the cursor.
    canvas.addEventListener("pointerup", pointerEnd);
    canvas.addEventListener("pointercancel", pointerEnd);
    canvas.addEventListener(
        "wheel",
        (ev) => {
            ev.preventDefault();
            const r = canvas.getBoundingClientRect();
            zoom(
                Math.exp(-ev.deltaY * 0.001),
                ev.clientX - r.left,
                ev.clientY - r.top,
            );
        }, {
            passive: false
        },
    );
    $("inlineText").addEventListener("blur", () => finishText());
    // In the inline editor: Escape cancels, Ctrl/Cmd+Enter saves.
    $("inlineText").addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
            finishText(true);
            ev.stopPropagation();
        }
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
            finishText();
            ev.stopPropagation();
        }
    });
    // ---- Inspector (left panel) ----

    // Change a style property for new elements and for the current selection.
    function changeStyle(key, value) {
        currentStyle[key] = value;
        if (selected.size) {
            checkpoint();
            doc.elements
                .filter((e) => selected.has(e.id))
                .forEach((e) => (e.style[key] = value));
        }
        commit();
    }
    // Style inputs in the inspector.
    for (const key of [
            "stroke",
            "fill",
            "strokeWidth",
            "dash",
            "fontSize",
            "routing",
            "opacity",
        ])
        $(key).addEventListener("change", (ev) =>
            changeStyle(
                key,
                ["strokeWidth", "fontSize"].includes(key) ?
                Number(ev.target.value) :
                key === "opacity" ?
                Number(ev.target.value) / 100 :
                ev.target.value,
            ),
        );
    // Color swatch buttons for stroke and fill.
    for (const [prop, colors] of [
            ["stroke", ["#303547", "#db594f", "#7e829b", "#438c78", "#4e83bd"]],
            ["fill", ["transparent", "#e5e9fc", "#ffdbd5", "#fff0b8", "#dceee5"]],
        ])
        for (const c of colors) {
            const b = document.createElement("button");
            b.className = "swatch";
            b.style.background =
                c === "transparent" ?
                "linear-gradient(135deg, white 47%, #d98477 49%, #d98477 51%, white 53%)" :
                c;
            b.dataset.prop = prop;
            b.dataset.color = c;
            b.title = c === "transparent" ? "Transparent" : c;
            b.setAttribute("aria-label", `${prop}: ${c}`);
            b.onclick = () => changeStyle(prop, c);
            $(prop + "Swatches").append(b);
        }
    $("noFill").onclick = () => changeStyle("fill", "transparent");
    // Text and position/size fields for a single selected element.
    $("elementText").onchange = () => {
        const e = get([...selected][0]);
        if (e) {
            checkpoint();
            e.text = $("elementText").value;
            commit();
        }
    };
    for (const [key, id] of [
            ["x", "elementX"],
            ["y", "elementY"],
            ["w", "elementW"],
            ["h", "elementH"],
        ])
        $(id).onchange = () => {
            const e = get([...selected][0]),
                v = Number($(id).value);
            if (e && Number.isFinite(v) && Math.abs(v) <= 1e7) {
                checkpoint();
                if (e.type === "group" && ["x", "y"].includes(key)) {
                    const delta = v - e[key];
                    doc.elements
                        .filter((n) => n.groupId === e.id)
                        .forEach((n) => (n[key] += delta));
                }
                e[key] = ["w", "h"].includes(key) ? Math.max(20, v) : v;
                commit();
            }
        };
    // Build the toolbar buttons, with dividers before the shapes and the text tools.
    for (const [t, path] of Object.entries(icons)) {
        if (t === "rectangle" || t === "text") {
            const d = document.createElement("span");
            d.className = "divider";
            document.querySelector(".toolbar").append(d);
        }
        const b = document.createElement("button");
        b.className = "tool" + (t === tool ? " active" : "");
        b.dataset.tool = t;
        b.title = `${t} (${shortcuts[t]})`;
        b.setAttribute("aria-label", b.title);
        const icon = svg("svg", {
            viewBox: "0 0 24 24"
        });
        svg("path", {
            d: path
        }, icon);
        b.append(icon);
        const small = document.createElement("small");
        small.textContent = shortcuts[t];
        b.append(small);
        b.onclick = () => setTool(t);
        document.querySelector(".toolbar").append(b);
    }
    // ---- Charts and groups ----

    // Add a pie or line chart with sample data in the middle of the view.
    function addChart(type) {
        checkpoint();
        const e = node(
            uid(),
            type,
            (canvas.clientWidth / 2 - view.x) / view.z - 220,
            (canvas.clientHeight / 2 - view.y) / view.z - 160,
            440,
            320,
            type === "pie" ? "Share by category" : "Progress over time",
            "#ffffff",
        );
        e.data =
            type === "pie" ?
            [{
                    label: "Design",
                    value: 45,
                    color: "#7e829b"
                },
                {
                    label: "Build",
                    value: 35,
                    color: "#db594f"
                },
                {
                    label: "Review",
                    value: 20,
                    color: "#438c78"
                },
            ] :
            [{
                label: "Series 1",
                color: "#db594f",
                points: [
                    [1, 10],
                    [2, 18],
                    [3, 14],
                    [4, 30],
                ],
            }, ];
        if (type === "chart") {
            e.xLabel = "Time";
            e.yLabel = "Value";
        }
        doc.elements.push(e);
        selected = new Set([e.id]);
        setTool("select");
        commit();
    }
    $("addPie").onclick = () => addChart("pie");
    $("addChart").onclick = () => addChart("chart");
    // Apply edited chart JSON; it is validated on a copy before replacing the board.
    $("applyChart").onclick = () => {
        try {
            const e = get([...selected][0]);
            if (!e || !["pie", "chart"].includes(e.type)) return;
            const next = clone(doc);
            next.elements.find((n) => n.id === e.id).data = JSON.parse(
                $("chartData").value,
            );
            const valid = F.validate(next);
            checkpoint();
            doc = valid;
            $("chartError").textContent = "";
            commit();
        } catch (err) {
            $("chartError").textContent = err.message;
        }
    };
    // Wrap the selection in a dashed group frame (nested groups are not allowed).
    // The frame goes first in the element list so it paints behind its members.
    $("groupSelection").onclick = () => {
        if (!selected.size) {
            toast("Select elements first, then choose Group.");
            return;
        }
        const members = doc.elements.filter((e) => selected.has(e.id));
        if (members.some((e) => e.type === "group" || e.groupId)) {
            toast("Ungroup these elements before creating a new group.");
            return;
        }
        checkpoint();
        const b = allBounds(members),
            g = node(
                uid(),
                "group",
                b.x - 25,
                b.y - 55,
                b.w + 50,
                b.h + 80,
                "Group",
                "transparent",
            );
        g.style.dash = "dashed";
        members.forEach((e) => (e.groupId = g.id));
        doc.elements.unshift(g);
        selected = new Set([g.id]);
        commit();
    };
    // Remove the selected group frames (or the groups of selected members) and
    // release their members.
    $("ungroup").onclick = () => {
        const groups = new Set(
            [...selected]
            .map((id) => (get(id)?.type === "group" ? id : get(id)?.groupId))
            .filter(Boolean),
        );
        if (!groups.size) return;
        checkpoint();
        doc.elements = doc.elements.filter(
            (e) => !groups.has(e.id) && !groups.has(e.from) && !groups.has(e.to),
        );
        doc.elements.forEach((e) => {
            if (groups.has(e.groupId)) delete e.groupId;
        });
        selected.clear();
        commit();
    };
    // ---- Buttons, files and import/export ----
    $("undo").onclick = () => undo();
    $("redo").onclick = () => undo(true);
    $("delete").onclick = remove;
    $("duplicate").onclick = duplicate;
    $("zoomIn").onclick = () => zoom(1.2);
    $("zoomOut").onclick = () => zoom(1 / 1.2);
    $("zoomReset").onclick = () => zoom(1 / view.z);
    $("fit").onclick = fit;
    // Layering: move the selection to the end (front) or start (back) of the list.
    for (const id of ["toFront", "toBack"])
        $(id).onclick = () => {
            if (!selected.size) return;
            checkpoint();
            const a = doc.elements.filter((e) => selected.has(e.id)),
                b = doc.elements.filter((e) => !selected.has(e.id));
            doc.elements = id === "toFront" ? [...b, ...a] : [...a, ...b];
            commit();
        };
    $("boardName").onchange = () => {
        checkpoint();
        doc.name = $("boardName").value.trim() || "Untitled board";
        commit();
    };
    // Trigger a browser download of text content.
    function download(content, name, type) {
        const a = document.createElement("a"),
            url = URL.createObjectURL(new Blob([content], {
                type
            }));
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    // Safe file name based on the board name.
    function filename() {
        return (
            doc.name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "board"
        );
    }
    // Download the board as a .redboard.json file.
    function save() {
        finishText();
        download(
            JSON.stringify(doc, null, 2),
            filename() + ".redboard.json",
            "application/json",
        );
        toast("Board saved as editable JSON.");
    }
    // Add image files as embedded pictures (max 8 MB each), scaled down to fit
    // 480x360 and centered on `position` or the middle of the view.
    async function addPictures(files, position) {
        for (const file of files) {
            try {
                if (
                    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                        file.type,
                    )
                )
                    throw Error("Choose a PNG, JPEG, WebP, or GIF picture.");
                if (file.size > 8 * 1024 * 1024)
                    throw Error("Please choose a picture smaller than 8 MB.");
                const src = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(Error("Could not read picture."));
                    reader.readAsDataURL(file);
                });
                const img = new Image();
                img.src = src;
                await img.decode();
                finishText();
                checkpoint();
                const scale = Math.min(
                    1,
                    480 / img.naturalWidth,
                    360 / img.naturalHeight,
                );
                const w = Math.max(20, img.naturalWidth * scale),
                    h = Math.max(20, img.naturalHeight * scale);
                const p = position || {
                    x: (canvas.clientWidth / 2 - view.x) / view.z,
                    y: (canvas.clientHeight / 2 - view.y) / view.z,
                };
                const e = {
                    id: uid(),
                    type: "image",
                    x: p.x - w / 2,
                    y: p.y - h / 2,
                    w,
                    h,
                    text: file.name || "Picture",
                    src,
                    style: {
                        ...F.defaults,
                        fill: "transparent"
                    },
                };
                doc.elements.push(e);
                selected = new Set([e.id]);
                setTool("select");
                commit();
                toast("Picture added. Drag to move; use corner handles to resize.");
            } catch (error) {
                toast(error.message);
            }
        }
    }
    $("addImage").onclick = () => $("imageInput").click();
    $("imageInput").onchange = async (ev) => {
        await addPictures([...ev.target.files]);
        ev.target.value = "";
    };
    // Pictures can also be dropped onto the canvas or pasted from the clipboard.
    workspace.addEventListener("dragover", (ev) => {
        if (ev.dataTransfer.types.includes("Files")) ev.preventDefault();
    });
    workspace.addEventListener("drop", (ev) => {
        ev.preventDefault();
        addPictures([...ev.dataTransfer.files], point(ev));
    });
    document.addEventListener("paste", (ev) => {
        if (
            ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
        )
            return;
        const files = [...ev.clipboardData.items]
            .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
            .map((i) => i.getAsFile())
            .filter(Boolean);
        if (files.length) {
            ev.preventDefault();
            addPictures(files);
        }
    });
    $("saveFile").onclick = save;
    $("openFile").onclick = () => $("fileInput").click();
    // Replace the whole board (open, new, apply source). This is undoable.
    function replaceBoard(next) {
        checkpoint();
        doc = next;
        selected.clear();
        sourceDirty = false;
        $("boardName").value = doc.name;
        commit();
        fit();
        refreshSource();
    }
    // Open a .redboard.json file (max 50 MB).
    $("fileInput").onchange = async (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        try {
            if (f.size > 50 * 1024 * 1024)
                throw Error("Please choose a file smaller than 50 MB.");
            const text = await f.text();
            replaceBoard(F.parse(text));
            toast("Board loaded. Undo restores your previous board.");
        } catch (e) {
            toast(e.message);
        }
        ev.target.value = "";
    };
    $("newBoard").onclick = () => {
        replaceBoard({
            format: "redboard",
            version: 1,
            name: "Untitled board",
            elements: [],
        });
        toast("Fresh canvas. Undo restores the previous board.");
    };
    // Export the board as a standalone SVG with a 30px margin.
    $("exportSvg").onclick = () => {
        finishText();
        const b = allBounds(),
            out = svg("svg", {
                xmlns: NS,
                viewBox: `${b.x - 30} ${b.y - 30} ${b.w + 60} ${b.h + 60}`,
                width: b.w + 60,
                height: b.h + 60,
            });
        doc.elements.forEach((e) => drawElement(e, out, true));
        download(
            new XMLSerializer().serializeToString(out),
            filename() + ".svg",
            "image/svg+xml",
        );
        toast("SVG exported with a transparent background.");
    };
    // Arrange connected nodes automatically (see layout in format.js).
    $("layout").onclick = () => {
        checkpoint();
        F.layout(doc);
        commit();
        fit();
        toast("Nodes arranged from left to right.");
    };
    // ---- Source panel ----

    // Show the current board as JSON, unless the user has unapplied edits there.
    function refreshSource() {
        if (sourceDirty) return;
        $("source").value = F.exportText(doc);
        $("sourceError").textContent = "";
    }
    $("source").oninput = () => {
        sourceDirty = true;
    };
    $("refreshSource").onclick = () => {
        sourceDirty = false;
        refreshSource();
    };
    // Validate the edited JSON and load it onto the canvas.
    $("applySource").onclick = () => {
        try {
            const next = F.parse($("source").value);
            replaceBoard(next);
            toast("Source applied to the canvas.");
        } catch (e) {
            $("sourceError").textContent = e.message;
        }
    };
    $("toggleSource").onclick = () => {
        $("sourcePanel").hidden = !$("sourcePanel").hidden;
        if (!$("sourcePanel").hidden) {
            refreshSource();
        }
    };
    $("closeSource").onclick = () => ($("sourcePanel").hidden = true);
    $("downloadSource").onclick = () =>
        download(
            $("source").value,
            filename() + ".redboard.json",
            "application/json",
        );
    // Help dialog.
    $("help").onclick = () => $("helpDialog").showModal();
    document.querySelector(".dialog-close").onclick = () =>
        $("helpDialog").close();
    // ---- Keyboard shortcuts ----
    // Ignored while typing in an input or while the help dialog is open.
    document.addEventListener("keydown", (ev) => {
        const input = ["INPUT", "TEXTAREA", "SELECT"].includes(
            document.activeElement.tagName,
        );
        if (input || $("helpDialog").open) return;
        // Ctrl/Cmd shortcuts: undo, redo, save, duplicate, select all.
        const mod = ev.ctrlKey || ev.metaKey;
        if (mod) {
            if (["z", "y", "s", "d", "a"].includes(ev.key.toLowerCase()))
                ev.preventDefault();
            if (ev.key.toLowerCase() === "z") undo(ev.shiftKey);
            if (ev.key.toLowerCase() === "y") undo(true);
            if (ev.key.toLowerCase() === "s") save();
            if (ev.key.toLowerCase() === "d") duplicate();
            if (ev.key.toLowerCase() === "a") {
                selected = new Set(doc.elements.map((e) => e.id));
                render();
                updateInspector();
            }
            return;
        }
        // Hold Space to pan.
        if (ev.code === "Space") {
            space = true;
            ev.preventDefault();
            render();
        }
        if (ev.key === "Escape") {
            selected.clear();
            setTool("select");
            updateInspector();
        }
        if (["Delete", "Backspace"].includes(ev.key)) {
            ev.preventDefault();
            remove();
        }
        // Single-letter tool shortcuts.
        const t = Object.keys(shortcuts).find(
            (t) => shortcuts[t] === ev.key.toUpperCase(),
        );
        if (t) setTool(t);
        if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key) &&
            selected.size
        ) {
            ev.preventDefault();
            checkpoint();
            // Arrow keys nudge the selection by 1px (10px with Shift).
            const amount = ev.shiftKey ? 10 : 1;
            doc.elements
                .filter((e) => movingIds().has(e.id))
                .forEach((e) => {
                    if (ev.key === "ArrowLeft") e.x -= amount;
                    if (ev.key === "ArrowRight") e.x += amount;
                    if (ev.key === "ArrowUp") e.y -= amount;
                    if (ev.key === "ArrowDown") e.y += amount;
                });
            commit();
        }
    });
    document.addEventListener("keyup", (ev) => {
        if (ev.code === "Space") {
            space = false;
            render();
        }
    });
    // Reset Space and any drag if the window loses focus mid-gesture.
    window.addEventListener("blur", () => {
        space = false;
        pointerEnd();
    });
    try {
        // Startup: restore the autosaved board, or show the demo board.
        const saved = localStorage.getItem("redboard-v1");
        doc = saved ? F.validate(JSON.parse(saved)) : demo();
    } catch {
        doc = demo();
        toast(
            "Could not restore browser storage. Open a saved board file if needed.",
        );
    }
    $("boardName").value = doc.name;
    // Redraw when the workspace is resized, then fit the board on the first frame.
    new ResizeObserver(() => render()).observe(workspace);
    refreshSource();
    updateInspector();
    requestAnimationFrame(fit);
})();