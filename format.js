/* RedBoard's dependency-free, shared document and text-format implementation. */
// Wrapped in an IIFE so the same file works as a browser <script> (exposes
// window.BoardFormat) and as a Node CommonJS module (module.exports).
(function (root) {
    "use strict";
    // Every element type the format supports.
    const types = [
        "rectangle",
        "ellipse",
        "diamond",
        "text",
        "sticky",
        "arrow",
        "line",
        "draw",
        "image",
        "group",
        "pie",
        "chart",
    ];
    // Default style; any missing style keys on an element are filled from here.
    const defaults = {
        stroke: "#303547",
        fill: "#e5e9fc",
        strokeWidth: 2,
        dash: "solid",
        fontSize: 18,
        opacity: 1,
        routing: "straight",
    };
    // Merge a partial style object over the defaults.
    const style = (s) => ({
        ...defaults,
        ...s
    });
    // Return n if it is a finite number within ±10,000,000, otherwise throw
    // an error that names the offending field.
    const finite = (n, name) => {
        if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e7)
            throw Error(`${name} must be a finite number within ±10,000,000.`);
        return n;
    };
    // True for #rgb, #rgba, #rrggbb, #rrggbbaa hex colors or "transparent".
    const color = (c) =>
        typeof c === "string" &&
        /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|transparent)$/i.test(
            c,
        );
    /**
     * Validate a parsed RedBoard document and return a normalized copy.
     * Throws an Error with a readable message on the first problem found.
     * Unknown properties are dropped; missing styles get defaults.
     */
    function validate(raw) {
        if (
            !raw ||
            raw.format !== "redboard" ||
            raw.version !== 1 ||
            !Array.isArray(raw.elements)
        )
            throw Error(
                'Expected a RedBoard document: format "redboard", version 1, and an elements array.',
            );
        if (raw.elements.length > 5000)
            throw Error("A board can contain up to 5,000 elements.");
        // Track IDs so duplicates can be rejected.
        const ids = new Set();
        const elements = raw.elements.map((e, i) => {
            if (
                !e ||
                typeof e.id !== "string" ||
                !/^[a-zA-Z_][\w-]{0,79}$/.test(e.id) ||
                ids.has(e.id)
            )
                throw Error(
                    `Element ${i + 1}: use a unique ID starting with a letter or underscore (up to 80 characters).`,
                );
            ids.add(e.id);
            if (!types.includes(e.type))
                throw Error(`${e.id}: unsupported type "${e.type}".`);
            // Copy only the known shared fields into a fresh object.
            const out = {
                id: e.id,
                type: e.type,
                x: finite(e.x, `${e.id}.x`),
                y: finite(e.y, `${e.id}.y`),
                w: finite(e.w, `${e.id}.w`),
                h: finite(e.h, `${e.id}.h`),
                text: String(e.text ?? "").slice(0, 20000),
                style: style(e.style),
            };
            if (!["arrow", "line", "draw"].includes(e.type) && (e.w < 20 || e.h < 20))
                throw Error(`${e.id}: width and height must be at least 20.`);
            // Style checks: colors, numeric ranges and enum values.
            if (!color(out.style.stroke) || !color(out.style.fill))
                throw Error(`${e.id}: colors must be hex colors or "transparent".`);
            ["strokeWidth", "fontSize", "opacity"].forEach((k) =>
                finite(out.style[k], `${e.id}.style.${k}`),
            );
            if (
                out.style.strokeWidth < 0 ||
                out.style.strokeWidth > 30 ||
                out.style.fontSize < 8 ||
                out.style.fontSize > 200 ||
                out.style.opacity < 0 ||
                out.style.opacity > 1
            )
                throw Error(`${e.id}: style values are out of range.`);
            if (
                !["solid", "dashed", "dotted"].includes(out.style.dash) ||
                !["straight", "elbow", "curve"].includes(out.style.routing)
            )
                throw Error(`${e.id}: unknown dash or routing style.`);
            // Connectors may attach to nodes through optional from/to IDs.
            if (["arrow", "line"].includes(e.type))
                for (const k of ["from", "to"]) {
                    if (e[k] != null && typeof e[k] !== "string")
                        throw Error(`${e.id}.${k} must be an element ID.`);
                    if (e[k]) out[k] = e[k];
                }
            // Group membership; the referenced group is checked after the loop.
            if (e.groupId !== undefined) {
                if (typeof e.groupId !== "string")
                    throw Error(e.id + ": groupId must be a group ID.");
                out.groupId = e.groupId;
            }
            // Charts: pie slices are {label, value, color}; line-chart series are
            // {label, color, points: [[x, y], ...]}.
            if (["pie", "chart"].includes(e.type)) {
                if (!Array.isArray(e.data) || !e.data.length || e.data.length > 100)
                    throw Error(e.id + ": chart needs 1–100 data entries.");
                if (e.type === "pie") {
                    out.data = e.data.map((d) => {
                        if (
                            !d ||
                            typeof d.label !== "string" ||
                            !color(d.color) ||
                            finite(d.value, "slice value") < 0
                        )
                            throw Error(
                                e.id +
                                ": each slice needs label, nonnegative value, and hex color.",
                            );
                        return {
                            label: d.label,
                            value: d.value,
                            color: d.color
                        };
                    });
                    if (!out.data.some((d) => d.value > 0))
                        throw Error(e.id + ": at least one slice must be positive.");
                } else {
                    out.data = e.data.map((d) => {
                        if (
                            !d ||
                            typeof d.label !== "string" ||
                            !color(d.color) ||
                            !Array.isArray(d.points) ||
                            !d.points.length ||
                            d.points.length > 2000
                        )
                            throw Error(
                                e.id + ": each series needs label, color, and 1–2000 points.",
                            );
                        return {
                            label: d.label,
                            color: d.color,
                            points: d.points.map((p) => {
                                if (!Array.isArray(p) || p.length !== 2)
                                    throw Error("Chart points must be [x,y].");
                                return [finite(p[0], "chart x"), finite(p[1], "chart y")];
                            }),
                        };
                    });
                    out.xLabel = String(e.xLabel ?? "");
                    out.yLabel = String(e.yLabel ?? "");
                }
            }
            // Pictures must be embedded base64 data URLs so boards stay portable.
            if (e.type === "image") {
                if (
                    typeof e.src !== "string" ||
                    !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
                        e.src,
                    )
                )
                    throw Error(
                        e.id +
                        ": image needs an embedded PNG, JPEG, WebP, or GIF data URL.",
                    );
                out.src = e.src;
            }
            // Freehand drawings: points are [dx, dy] offsets from the element's x/y.
            if (e.type === "draw") {
                if (
                    !Array.isArray(e.points) ||
                    e.points.length < 2 ||
                    e.points.length > 30000
                )
                    throw Error(`${e.id}: drawing needs 2–30,000 points.`);
                out.points = e.points.map((p) => {
                    if (!Array.isArray(p) || p.length !== 2)
                        throw Error(`${e.id}: invalid point.`);
                    return [finite(p[0], "point x"), finite(p[1], "point y")];
                });
            }
            return out;
        });
        // Second pass: every from/to must point at an existing node (not a connector or drawing).
        for (const e of elements)
            for (const k of ["from", "to"])
                if (
                    e[k] &&
                    !elements.some(
                        (n) => n.id === e[k] && !["arrow", "line", "draw"].includes(n.type),
                    )
                )
                    throw Error(`${e.id}.${k} references a missing node: ${e[k]}.`);
        // Every groupId must point at a group, and groups cannot be nested.
        for (const e of elements)
            if (e.groupId) {
                const group = elements.find(
                    (g) => g.id === e.groupId && g.type === "group",
                );
                if (!group || e.type === "group")
                    throw Error(
                        e.id +
                        ": groupId must reference a group; nested groups are not supported.",
                    );
            }
        return {
            format: "redboard",
            version: 1,
            name: String(raw.name ?? "Untitled board").slice(0, 200),
            elements,
        };
    }
    /**
     * Simple layered auto layout. Nodes are ranked by their longest path along
     * connectors (topological order), then each rank is placed in a column (LR/RL)
     * or row (TB/BT). Nodes in cycles get sequential ranks. Group members move
     * with their group. Mutates and returns doc.
     */
    function layout(doc, dir = "LR") {
        // Top-level nodes only: group members follow their frame instead.
        const nodes = doc.elements.filter(
            (e) => !e.groupId && !["arrow", "line", "draw"].includes(e.type),
        );
        // Remember group positions so members can be shifted by the same amount.
        const oldGroups = new Map(
            nodes
            .filter((e) => e.type === "group")
            .map((e) => [e.id, {
                x: e.x,
                y: e.y
            }]),
        );
        // Connectors whose both ends are laid-out nodes.
        const edges = doc.elements.filter(
            (e) =>
            nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to),
        );
        // Kahn's algorithm: start from nodes with no incoming edges.
        const ranks = new Map(nodes.map((n) => [n.id, 0]));
        const indegree = new Map(nodes.map((n) => [n.id, 0]));
        edges.forEach((e) => indegree.set(e.to, (indegree.get(e.to) || 0) + 1));
        const queue = nodes.filter((n) => !indegree.get(n.id)).map((n) => n.id);
        const visited = new Set();
        while (queue.length) {
            const id = queue.shift();
            visited.add(id);
            for (const e of edges.filter((e) => e.from === id)) {
                ranks.set(
                    e.to,
                    Math.max(ranks.get(e.to) || 0, (ranks.get(id) || 0) + 1),
                );
                indegree.set(e.to, indegree.get(e.to) - 1);
                if (indegree.get(e.to) === 0) queue.push(e.to);
            }
        }
        // Nodes never reached are part of a cycle; give them their own ranks.
        let cycleRank = 0;
        nodes
            .filter((n) => !visited.has(n.id))
            .forEach((n) => ranks.set(n.id, cycleRank++));
        // Bucket nodes by rank.
        const groups = new Map();
        nodes.forEach((n) => {
            const r = ranks.get(n.id);
            if (!groups.has(r)) groups.set(r, []);
            groups.get(r).push(n);
        });
        // Place ranks along the major axis, stacking each rank's nodes along the minor axis.
        const horizontal = ["LR", "RL"].includes(dir);
        let major = 80;
        const reverse = ["RL", "BT"].includes(dir);
        const sorted = [...groups].sort((a, b) => a[0] - b[0]);
        if (reverse) sorted.reverse();
        for (const [, group] of sorted) {
            let minor = 100;
            for (const n of group) {
                n.x = horizontal ? major : minor;
                n.y = horizontal ? minor : major;
                minor += (horizontal ? n.h : n.w) + 65;
            }
            major += Math.max(...group.map((n) => (horizontal ? n.w : n.h))) + 110;
        }
        // Shift group members by how far their group moved.
        for (const e of doc.elements)
            if (e.groupId && oldGroups.has(e.groupId)) {
                const old = oldGroups.get(e.groupId),
                    g = doc.elements.find((n) => n.id === e.groupId);
                e.x += g.x - old.x;
                e.y += g.y - old.y;
            }
        return doc;
    }
    // Public API (window.BoardFormat in the browser, module.exports in Node).
    const api = {
        types,
        defaults,
        validate,
        layout,
        exportText: (doc) => JSON.stringify(doc, null, 2),
        parse: (text) => validate(JSON.parse(text)),
    };
    if (typeof module !== "undefined") module.exports = api;
    else root.BoardFormat = api;
})(typeof window !== "undefined" ? window : globalThis);