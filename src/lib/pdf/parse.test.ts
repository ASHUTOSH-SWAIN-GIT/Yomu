import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parsePages } from "@/lib/pdf/parse";
import {
  parsePdfDate,
  polyfillStreamIteration,
  readPdf,
  type PdfjsLib,
} from "@/lib/pdf/load";
import { NoTextError } from "@/lib/pdf/types";
import type { Block } from "@/types/article";

type Draw = (
  text: string,
  x: number,
  y: number,
  o?: { size?: number; bold?: boolean },
) => void;

/** A small paper: title and abstract across the page, then two columns,
 * with a running head and a page number on each page. */
async function paper(pages = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Untitled");
  doc.setCreationDate(new Date(Date.UTC(2017, 5, 12)));
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  for (let p = 1; p <= pages; p++) {
    const page = doc.addPage([612, 792]);
    const draw: Draw = (text, x, y, o = {}) =>
      page.drawText(text, {
        x,
        y: 792 - y,
        size: o.size ?? 10,
        font: o.bold ? bold : regular,
      });
    draw("Running Head of the Journal", 200, 30);
    draw(String(p), 300, 760);

    if (p === 1) {
      draw("Attention Is All You Need", 150, 90, { size: 20, bold: true });
      draw("Ada Lovelace, Alan Turing", 220, 120);
      draw("Abstract", 72, 160, { bold: true });
      draw(
        "We propose a new network architecture based on attention.",
        72,
        175,
      );
      draw("1 Introduction", 72, 210, { bold: true, size: 12 });
    }
    const top = p === 1 ? 230 : 70;
    const left = [
      "Recurrent models process the input one",
      "step at a time and this prevents parallel",
      "training because of the long depen-",
      "dency chains in the sequence. Each step",
      "needs the result of the one before it.",
    ];
    const right = [
      "Attention lets the model look at every",
      "position at once which makes training",
      "much faster on modern hardware. The",
      "Transformer uses stacked self-attention",
      "and point-wise fully connected layers.",
    ];
    left.forEach((t, i) => draw(t, 72, top + i * 12));
    right.forEach((t, i) => draw(t, 320, top + i * 12));
    draw("2 Model", 72, top + 80, { bold: true, size: 12 });
    draw("The model has an encoder and a decoder.", 72, top + 98);
    draw("Both are stacks of identical layers.", 320, top + 98);
  }
  return doc.save();
}

const text = (b: Block) =>
  b.type === "paragraph"
    ? b.spans.map((s) => s.text).join("")
    : b.type === "heading"
      ? b.text
      : "";

async function parse(bytes: Uint8Array) {
  const { pages, info } = await readPdf(pdfjs as unknown as PdfjsLib, bytes);
  return parsePages(pages, info, "paper.pdf");
}

describe("reading a paper", () => {
  it("finds the title and the author, and leaves them out of the body", async () => {
    const out = await parse(await paper());
    expect(out.title).toBe("Attention Is All You Need");
    expect(out.author).toBe("Ada Lovelace, Alan Turing");
    expect(out.blocks.map(text)).not.toContain("Attention Is All You Need");
    expect(out.pageCount).toBe(3);
  });

  it("reads the left column, then the right", async () => {
    const out = await parse(await paper());
    const all = out.blocks.map(text).join("\n");
    const left = all.indexOf("Recurrent models");
    const right = all.indexOf("Attention lets the model");
    expect(left).toBeGreaterThan(-1);
    expect(right).toBeGreaterThan(left);
    // Not read across the gutter.
    expect(all).not.toMatch(/process the input one\s+Attention lets/);
  });

  it("joins a word split at the end of a line", async () => {
    const out = await parse(await paper());
    const all = out.blocks.map(text).join("\n");
    expect(all).toContain("dependency chains");
    expect(all).not.toContain("depen-");
  });

  it("makes headings of the section titles", async () => {
    const out = await parse(await paper());
    const headings = out.blocks.filter((b) => b.type === "heading");
    const names = headings.map(text);
    expect(names).toContain("1 Introduction");
    expect(names).toContain("2 Model");
    expect(names).toContain("Abstract");
    const intro = headings.find((h) => text(h) === "1 Introduction");
    expect(intro?.type === "heading" && intro.level).toBe(2);
  });

  it("drops the running head and the page numbers", async () => {
    const out = await parse(await paper());
    const all = out.blocks.map(text).join("\n");
    expect(all).not.toContain("Running Head");
    expect(out.blocks.map(text)).not.toContain("2");
  });

  it("takes the date from the file", async () => {
    const out = await parse(await paper());
    expect(out.publishedAt).toBe(Date.UTC(2017, 5, 12));
  });

  it("says so when there is no text", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    await expect(parse(await doc.save())).rejects.toBeInstanceOf(NoTextError);
  });

  it("tells how far it has got", async () => {
    const seen: number[] = [];
    await readPdf(pdfjs as unknown as PdfjsLib, await paper(2), (n) =>
      seen.push(n),
    );
    expect(seen).toEqual([1, 2]);
  });
});

async function singleColumn(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([612, 792]);
  let y = 80;
  const put = (
    t: string,
    o: { size?: number; bold?: boolean; x?: number } = {},
  ) => {
    page.drawText(t, {
      x: o.x ?? 72,
      y: 792 - y,
      size: o.size ?? 10,
      font: o.bold ? bold : regular,
    });
    y += (o.size ?? 10) * 1.3;
  };
  put("A Study of Things", { size: 22, bold: true });
  y += 20;
  put("1 Introduction", { bold: true, size: 12 });
  y += 4;
  put("We study several things in this paper. The main results are:");
  put("\u2022 the first thing is faster than the second thing", { x: 90 });
  put("\u2022 the second thing is smaller than the first", { x: 90 });
  y += 6;
  put("In the rest of this paper we explain how it works in detail and why.");
  y += 14;
  put("References", { bold: true, size: 12 });
  y += 4;
  put("[1] A. Author. A first paper about things. Journal of Things, 2020.");
  put("[2] B. Writer and C. Coder. Another paper. Conference, 2021.");
  return doc.save();
}

describe("lists and references", () => {
  it("makes a list of bulleted lines, without the bullets", async () => {
    const out = await parse(await singleColumn());
    const list = out.blocks.find((b) => b.type === "list");
    expect(list?.type === "list" && list.items).toHaveLength(2);
    const first =
      list?.type === "list"
        ? list.items[0].spans.map((s) => s.text).join("")
        : "";
    expect(first.startsWith("the first thing")).toBe(true);
  });

  it("makes one entry of each reference", async () => {
    const out = await parse(await singleColumn());
    const at = out.blocks.findIndex(
      (b) => b.type === "heading" && b.text === "References",
    );
    const entries = out.blocks.slice(at + 1).map(text);
    expect(entries).toHaveLength(2);
    expect(entries[0].startsWith("[1] A. Author")).toBe(true);
    expect(entries[1].startsWith("[2] B. Writer")).toBe(true);
  });

  it("takes the file's name when the paper has no title", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const page = doc.addPage([612, 792]);
    for (let i = 0; i < 8; i++) {
      page.drawText("Some plain text that goes on and on about nothing much.", {
        x: 72,
        y: 700 - i * 14,
        size: 10,
        font,
      });
    }
    const out = await parse(await doc.save());
    expect(out.title).toBe("paper");
  });
});

describe("an engine that cannot loop over a stream", () => {
  it("still reads a paper once the iterator is added", async () => {
    const proto = ReadableStream.prototype as unknown as Record<
      symbol | string,
      unknown
    >;
    const native = proto[Symbol.asyncIterator];
    const values = proto.values;
    delete proto[Symbol.asyncIterator];
    delete proto.values;
    try {
      const stream = () =>
        new ReadableStream<number>({
          start(c) {
            c.enqueue(1);
            c.enqueue(2);
            c.close();
          },
        });
      await expect(
        (async () => {
          const got: number[] = [];
          for await (const v of stream() as unknown as AsyncIterable<number>)
            got.push(v);
          return got;
        })(),
      ).rejects.toThrow();

      polyfillStreamIteration();
      const got: number[] = [];
      for await (const v of stream() as unknown as AsyncIterable<number>)
        got.push(v);
      expect(got).toEqual([1, 2]);

      const out = await parse(await paper(1));
      expect(out.title).toBe("Attention Is All You Need");
    } finally {
      proto[Symbol.asyncIterator] = native;
      proto.values = values;
    }
  });
});

describe("PDF dates", () => {
  it("reads the usual form, and refuses anything else", () => {
    expect(parsePdfDate("D:20170612143000+02'00'")).toBe(
      Date.UTC(2017, 5, 12, 14, 30, 0),
    );
    expect(parsePdfDate("D:2017")).toBe(Date.UTC(2017, 0, 1));
    expect(parsePdfDate("yesterday")).toBeNull();
    expect(parsePdfDate(undefined)).toBeNull();
  });
});
