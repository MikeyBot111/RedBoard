/* Native chart and frame rendering, shared by canvas and SVG export. */
window.BoardExtras = {
    /**
     * Draw a group frame, pie chart or line chart element.
     * @param e       the normalized element (see format.js)
     * @param parent  SVG node to append into
     * @param svg     helper svg(tag, attrs, parent) that creates an SVG element
     */
    render(e, parent, svg) {
        const s = e.style;
        // Group: a rounded frame (clickable only on its outline) with a title.
        if (e.type === "group") {
            svg(
                "rect", {
                    x: e.x,
                    y: e.y,
                    width: e.w,
                    height: e.h,
                    rx: 10,
                    fill: s.fill,
                    stroke: s.stroke,
                    "stroke-width": s.strokeWidth,
                    "stroke-dasharray": s.dash === "solid" ? "none" : s.dash === "dotted" ? "1 7" : "9 7",
                    "pointer-events": "stroke",
                },
                parent,
            );
            const title = svg(
                "text", {
                    x: e.x + 14,
                    y: e.y + 27,
                    fill: s.stroke,
                    "font-size": s.fontSize,
                    "font-family": "Segoe UI, sans-serif",
                },
                parent,
            );
            title.textContent = e.text;
            return;
        }
        // Charts draw into a nested <svg> with a fixed 440-wide viewBox that is
        // stretched to the element's size. Its height grows with the legend.
        const height =
            e.type === "pie" ?
            Math.max(320, 105 + e.data.length * 23) :
            Math.max(320, 270 + e.data.length * 18),
            g = svg(
                "svg", {
                    x: e.x,
                    y: e.y,
                    width: e.w,
                    height: e.h,
                    viewBox: `0 0 440 ${height}`,
                    preserveAspectRatio: "none",
                },
                parent,
            );
        // Helper: add a text label inside the chart.
        const text = (
            x,
            y,
            value,
            size = 12,
            anchor = "start",
            fill = s.stroke,
        ) => {
            const t = svg(
                "text", {
                    x,
                    y,
                    fill,
                    "font-size": size,
                    "text-anchor": anchor,
                    "font-family": "Segoe UI, sans-serif",
                },
                g,
            );
            t.textContent = value;
            return t;
        };
        // Chart background card.
        svg(
            "rect", {
                x: 1,
                y: 1,
                width: 438,
                height: height - 2,
                rx: 10,
                fill: s.fill,
                stroke: s.stroke,
                "stroke-width": s.strokeWidth,
            },
            g,
        );
        // Chart title.
        text(20, 30, e.text, s.fontSize);
        // Pie chart: slices start at 12 o'clock and go clockwise; legend on the right.
        if (e.type === "pie") {
            const total = e.data.reduce((n, d) => n + d.value, 0),
                cx = 122,
                cy = height / 2 + 15,
                r = 95;
            let angle = -Math.PI / 2;
            e.data.forEach((d, i) => {
                const portion = d.value / total,
                    end = angle + portion * Math.PI * 2;
                // A single 100% slice can't be drawn as an arc, so use a full circle.
                if (portion === 1) svg("circle", {
                    cx,
                    cy,
                    r,
                    fill: d.color
                }, g);
                else if (portion > 0)
                    svg(
                        "path", {
                            d: `M${cx} ${cy} L${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} A${r} ${r} 0 ${portion > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)} Z`,
                            fill: d.color,
                            stroke: "#fff",
                            "stroke-width": 1,
                        },
                        g,
                    );
                svg(
                    "rect", {
                        x: 240,
                        y: 65 + i * 23,
                        width: 10,
                        height: 10,
                        rx: 2,
                        fill: d.color,
                    },
                    g,
                );
                text(
                    258,
                    75 + i * 23,
                    `${d.label}: ${d.value} (${Math.round(portion * 100)}%)`,
                );
                angle = end;
            });
        } else {
            // Line chart: find the data range across all series.
            const points = e.data.flatMap((d) => d.points),
                xs = points.map((p) => p[0]),
                ys = points.map((p) => p[1]);
            let xmin = Math.min(...xs),
                xmax = Math.max(...xs),
                ymin = Math.min(...ys),
                ymax = Math.max(...ys);
            // Avoid dividing by zero when all values are equal.
            if (xmin === xmax) {
                xmin -= 1;
                xmax += 1;
            }
            if (ymin === ymax) {
                ymin -= 1;
                ymax += 1;
            }
            // Plot area bounds and data-to-pixel mapping functions.
            const top = 65,
                bottom = height - 65 - e.data.length * 18,
                left = 65,
                right = 412,
                X = (x) => left + ((x - xmin) / (xmax - xmin)) * (right - left),
                Y = (y) => bottom - ((y - ymin) / (ymax - ymin)) * (bottom - top),
                fmt = (n) => Number(n.toPrecision(4)).toString();
            // Five gridlines with axis tick labels.
            for (let i = 0; i <= 4; i++) {
                const y = ymin + ((ymax - ymin) * i) / 4,
                    x = xmin + ((xmax - xmin) * i) / 4;
                svg(
                    "line", {
                        x1: left,
                        x2: right,
                        y1: Y(y),
                        y2: Y(y),
                        stroke: "#e8e7e4"
                    },
                    g,
                );
                text(left - 8, Y(y) + 4, fmt(y), 10, "end");
                text(X(x), bottom + 17, fmt(x), 10, "middle");
            }
            // Axis lines (left and bottom).
            svg(
                "path", {
                    d: `M${left} ${top} V${bottom} H${right}`,
                    fill: "none",
                    stroke: s.stroke,
                },
                g,
            );
            // Axis titles.
            text((left + right) / 2, bottom + 35, e.xLabel, 11, "middle");
            text(16, 52, e.yLabel, 11);
            // Each series: a polyline with point markers, plus a legend entry below.
            e.data.forEach((d, i) => {
                svg(
                    "polyline", {
                        points: d.points.map((p) => `${X(p[0])},${Y(p[1])}`).join(" "),
                        fill: "none",
                        stroke: d.color,
                        "stroke-width": s.strokeWidth,
                        "stroke-dasharray": s.dash === "solid" ? "none" : s.dash === "dotted" ? "1 7" : "9 7",
                    },
                    g,
                );
                d.points.forEach((p) =>
                    svg("circle", {
                        cx: X(p[0]),
                        cy: Y(p[1]),
                        r: 3,
                        fill: d.color
                    }, g),
                );
                svg(
                    "rect", {
                        x: 65,
                        y: bottom + 48 + i * 18,
                        width: 12,
                        height: 4,
                        fill: d.color,
                    },
                    g,
                );
                text(85, bottom + 54 + i * 18, d.label, 11);
            });
        }
    },
};