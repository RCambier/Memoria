import { describe, expect, it } from "vitest";
import { noteImages } from "../src/lib/noteImages.js";

describe("noteImages", () => {
  it("returns no images and the text unchanged when there are none", () => {
    expect(noteImages("Just some **text**.")).toEqual({ images: [], text: "Just some **text**." });
  });

  it("extracts a drive: image and strips it from the text", () => {
    const { images, text } = noteImages("Before\n\n![room](drive:abc123)\n\nAfter");
    expect(images).toEqual([{ alt: "room", src: "drive:abc123" }]);
    expect(text).toBe("Before\n\nAfter");
  });

  it("extracts an https image", () => {
    const { images } = noteImages("![x](https://ex.test/a.png)");
    expect(images).toEqual([{ alt: "x", src: "https://ex.test/a.png" }]);
  });

  it("keeps order and counts multiple images", () => {
    const { images, text } = noteImages("![a](drive:1) mid ![b](drive:2)");
    expect(images.map((i) => i.src)).toEqual(["drive:1", "drive:2"]);
    expect(text).toBe("mid");
  });

  it("collapses the blank lines left where images were removed", () => {
    const { text } = noteImages("Title\n\n![a](drive:1)\n\n![b](drive:2)\n\nBody");
    expect(text).toBe("Title\n\nBody");
  });

  it("leaves a plain link (not an image) alone", () => {
    const { images, text } = noteImages("see [docs](https://ex.test)");
    expect(images).toEqual([]);
    expect(text).toBe("see [docs](https://ex.test)");
  });

  it("handles an image-only note (empty text)", () => {
    expect(noteImages("![only](drive:z)")).toEqual({ images: [{ alt: "only", src: "drive:z" }], text: "" });
  });
});
