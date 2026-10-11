import { describe, expect, it } from "vitest";
import { graphicsOf, type DrawOps } from "@/lib/pdf/graphics";
import { buildLines, type Line } from "@/lib/pdf/lines";
import { findRegions, placeRegions } from "@/lib/pdf/regions";
import { splitFootnotes } from "@/lib/pdf/blocks";
import { linkAt } from "@/lib/pdf/load";
import type { Box, PdfPage } from "@/lib/pdf/types";

const PAGE = { width: 612, height: 792 };
const BODY = 10;

/** A line as the parser makes it. Column 1 runs from 72 to 300. */
function line(
  text: string,
  y: number,
  o: Partial<Line> & { x?: number; x2?: number } = {},
): Line {
  const x = o.x ?? 72;
  return {
    page: 1,
    x,
    x2: o.x2 ?? 300,
    y,
    rel: y / PAGE.height,
    size: o.size ?? BODY,
    runs: [{ text, bold: false, italic: false, mono: false }],
    text,
    bold: false,
    mono: false,
    col: 0,
    colRight: o.x2 ?? 300,
    ...o,
  };
}

/** Prose: a full-width line of words. */
const prose = (y: number, words = "the quick brown fox jumps over it") =>
  line(`Some running text with ${words}.`, y);
const box = (x: number, y: number, x2: number, y2: number, image = true) =>
  ({ x, y, x2, y2, image }) satisfies Box;

describe("figures from their captions", () => {
  it("cuts the picture above a caption, with its labels, up to the prose", () => {
    const labels = [
      line("x", 140, { x: 120, x2: 130 }),
      line("y", 170, { x: 200, x2: 210 }),
    ];
    const caption = line("Figure 2: How the parts fit.", 200, {
      size: 9,
      x2: 230,
    });
    const after = prose(230);
    const page = [prose(100), ...labels, caption, after];
    const [r] = findRegions(page, [box(110, 115, 260, 185)], BODY, 1, PAGE);

    expect(r).toMatchObject({ kind: "figure", page: 1 });
    expect(r.caption).toBe("Figure 2: How the parts fit.");
    // Between the prose above and the caption, and the picture's width.
    expect(r.y).toBeGreaterThan(100);
    expect(r.y2).toBeLessThan(200);
    expect(r.x).toBeLessThan(110);
    expect([...r.lines]).toEqual(expect.arrayContaining([...labels, caption]));
    expect(r.lines.has(after)).toBe(false);
  });

  it("puts a table on the side of its caption that has the table", () => {
    const caption = line("Table 1: Latencies.", 100, { size: 9, x2: 200 });
    const cells = [
      line("op", 120, { x: 80, x2: 100 }),
      line("mean", 120, { x: 150, x2: 180 }),
      line("read", 134, { x: 80, x2: 105 }),
    ];
    const page = [caption, ...cells, prose(170)];
    const [r] = findRegions(
      page,
      [box(75, 110, 290, 140, false)],
      BODY,
      1,
      PAGE,
    );
    expect(r.kind).toBe("table");
    expect(r.y).toBeGreaterThan(100);
    expect([...r.lines]).toEqual(expect.arrayContaining(cells));
  });

  it("leaves a caption alone when nothing is next to it", () => {
    const page = [
      prose(100),
      line("Figure 9: Lost.", 112, { x2: 150 }),
      prose(124),
    ];
    expect(findRegions(page, [], BODY, 1, PAGE)).toEqual([]);
  });

  it("stops at a section heading above a figure", () => {
    const heading = line("3 TrueTime", 90, { bold: true, x2: 130 });
    const cell = line("TT.now()", 120, { x: 90, x2: 140 });
    const caption = line("Table 1: TrueTime API.", 150, { size: 9, x2: 200 });
    const [r] = findRegions(
      [heading, cell, caption, prose(180)],
      [box(80, 110, 280, 135, false)],
      BODY,
      1,
      PAGE,
    );
    expect(r.lines.has(heading)).toBe(false);
    expect(r.lines.has(cell)).toBe(true);
  });

  it("takes a big picture without a caption, but not a small logo", () => {
    const page = [prose(100), prose(300)];
    const regions = findRegions(
      page,
      [box(100, 150, 260, 260), box(80, 280, 100, 290)],
      BODY,
      4,
      PAGE,
    );
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ kind: "image", caption: null });
  });
});

describe("display equations", () => {
  it("cuts a centred line in math fonts, with its number", () => {
    const eq = line("a < b + c", 150, { x: 150, x2: 220, math: 0.8 });
    const num = line("(3)", 150, { x: 285, x2: 300 });
    const page = [prose(120), eq, num, prose(180)];
    const [r] = findRegions(page, [], BODY, 2, PAGE);
    expect(r).toMatchObject({ kind: "equation", id: "p2-eq1" });
    expect(r.lines).toEqual(new Set([eq, num]));
    // Room above for superscripts.
    expect(r.y).toBeLessThan(150 - BODY);
  });

  it("leaves prose with a little math in it", () => {
    const page = [
      line("where x < y holds for every pair of keys", 150, { math: 0.2 }),
    ];
    expect(findRegions(page, [], BODY, 1, PAGE)).toEqual([]);
  });
});

describe("placing a region in the text", () => {
  it("puts one stand-in where its first line was, and drops its lines", () => {
    const a = prose(100);
    const label = line("x", 140, { x: 120, x2: 130 });
    const caption = line("Figure 1: A.", 170, { size: 9, x2: 150 });
    const b = prose(200);
    const regions = findRegions(
      [a, label, caption, b],
      [box(110, 120, 260, 160)],
      BODY,
      1,
      PAGE,
    );
    const placed = placeRegions([a, label, caption, b], regions);
    expect(placed).toHaveLength(3);
    expect(placed[0]).toBe(a);
    expect(placed[1].region).toBe(regions[0]);
    expect(placed[2]).toBe(b);
  });
});

describe("drawing operators", () => {
  const OPS: DrawOps = {
    save: 1,
    restore: 2,
    transform: 3,
    constructPath: 4,
    paintImageXObject: 5,
    paintInlineImageXObject: 6,
    paintImageMaskXObject: 7,
    paintFormXObjectBegin: 8,
    paintFormXObjectEnd: 9,
  };

  it("places an image by the current matrix, measured from the top", () => {
    const boxes = graphicsOf(
      {
        fnArray: [1, 3, 5, 2],
        argsArray: [null, [200, 0, 0, 100, 50, 600], [], null],
      },
      OPS,
      792,
    );
    expect(boxes).toEqual([{ x: 50, x2: 250, y: 92, y2: 192, image: true }]);
  });

  it("places a path inside a form by both matrices, and forgets them after", () => {
    const boxes = graphicsOf(
      {
        fnArray: [8, 4, 9, 4],
        argsArray: [
          [
            [1, 0, 0, 1, 100, 0],
            [0, 0, 10, 10],
          ],
          [0, [], [0, 0, 10, 10]],
          null,
          [0, [], [0, 0, 10, 10]],
        ],
      },
      OPS,
      100,
    );
    expect(boxes).toEqual([
      { x: 100, x2: 110, y: 90, y2: 100, image: false },
      { x: 0, x2: 10, y: 90, y2: 100, image: false },
    ]);
  });
});

describe("sub- and superscripts", () => {
  it("join the line they belong to, beside text in another column", () => {
    const item = (str: string, x: number, y: number, size = 10) => ({
      str,
      x,
      y,
      width: str.length * size * 0.5,
      size,
      font: "",
    });
    const page: PdfPage = {
      number: 1,
      width: 612,
      height: 792,
      items: [
        item("t", 100, 570),
        item("abs", 105, 572, 6),
        item("commit", 115, 566, 6),
        // The other column, on almost the same baseline as the script.
        item("right column text", 320, 567),
      ],
    };
    const lines = buildLines(page);
    const left = lines.find((l) => l.x < 300)!;
    expect(left.text).toContain("abs");
    expect(left.text).toContain("commit");
    expect(left.size).toBe(10);
    expect(lines.filter((l) => l.size < 10)).toEqual([]);
  });
});

describe("footnotes", () => {
  it("are small lines with no body text under them, never in references", () => {
    const formula = line("a < b", 560, { size: 9 });
    const after = prose(600);
    const note = line("1 A footnote.", 700, { size: 8 });
    const refs = line("References", 100, { page: 2, bold: true });
    const ref = line("[1] A. Author. A paper.", 700, { page: 2, size: 8 });
    const { notes } = splitFootnotes([formula, after, note, refs, ref], BODY);
    expect(notes).toEqual([note]);
  });
});

describe("web links in a paper", () => {
  const link = {
    url: "https://example.org/x",
    x: 100,
    x2: 200,
    y: 90,
    y2: 102,
  };
  const text = (str: string, x: number, width: number) => ({
    str,
    x,
    y: 100,
    width,
    size: 10,
    font: "",
  });

  it("go to the text under them, and only that text", () => {
    expect(linkAt([link], text("example.org/x", 105, 90))).toBe(link.url);
    expect(linkAt([link], text("see", 60, 20))).toBeUndefined();
    expect(
      linkAt([link], { ...text("below", 105, 90), y: 130 }),
    ).toBeUndefined();
  });

  it("stay on their words through lines and spans", () => {
    const page: PdfPage = {
      number: 1,
      width: 612,
      height: 792,
      items: [
        text("Code at ", 72, 40),
        { ...text("example.org", 112, 55), href: link.url },
      ],
    };
    const [l] = buildLines(page);
    expect(l.runs.map((r) => [r.text.trim(), r.href])).toEqual([
      ["Code at", undefined],
      ["example.org", link.url],
    ]);
  });
});
