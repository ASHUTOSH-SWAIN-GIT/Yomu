import { describe, expect, it } from "vitest";
import {
  baseName,
  fileUrl,
  isPdfUrl,
  pdfCanonicalUrl,
  pdfShaOf,
} from "@/lib/pdf/identity";

describe("PDF identity", () => {
  it("tells a PDF from a web page by its canonical address", () => {
    const url = pdfCanonicalUrl("abc123");
    expect(isPdfUrl(url)).toBe(true);
    expect(pdfShaOf(url)).toBe("abc123");
    expect(isPdfUrl("https://example.com/paper.pdf")).toBe(false);
    expect(pdfShaOf("https://example.com/paper.pdf")).toBeNull();
  });

  it("writes a path as a file address", () => {
    expect(fileUrl("/Users/me/paper.pdf")).toBe("file:///Users/me/paper.pdf");
    expect(fileUrl("C:\\Users\\me\\paper.pdf")).toBe(
      "file:///C:/Users/me/paper.pdf",
    );
  });

  it("takes the file's name from a path or an address", () => {
    expect(baseName("/Users/me/My%20Paper.pdf")).toBe("My Paper.pdf");
    expect(baseName("C:\\docs\\paper.pdf")).toBe("paper.pdf");
    expect(baseName("file:///a/b/c.pdf")).toBe("c.pdf");
  });
});
