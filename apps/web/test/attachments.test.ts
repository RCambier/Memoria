import { describe, expect, it } from "vitest";
import {
  driveFileUrl,
  isAttachableImage,
  noteAttachmentMarkdown,
  taskAttachmentLine,
} from "../src/notes/attachments.js";

describe("attachment references", () => {
  it("images embed as drive: markdown images", () => {
    expect(noteAttachmentMarkdown("shot.png", "abc123", true)).toBe("![shot.png](drive:abc123)");
  });

  it("other files embed as 📎 links to the Drive file", () => {
    expect(noteAttachmentMarkdown("report.pdf", "abc123", false)).toBe(
      "[📎 report.pdf](https://drive.google.com/file/d/abc123/view)",
    );
  });

  it("strips characters that would break the markdown syntax from the label", () => {
    expect(noteAttachmentMarkdown("we[i]rd (name).png", "id1", true)).toBe("![weird name.png](drive:id1)");
  });

  it("tasks get a plain 📎 line whose URL Linkify can pick up", () => {
    expect(taskAttachmentLine("report.pdf", "abc123")).toBe(
      "📎 report.pdf — https://drive.google.com/file/d/abc123/view",
    );
  });

  it("driveFileUrl points at the file's Drive viewer", () => {
    expect(driveFileUrl("xyz")).toBe("https://drive.google.com/file/d/xyz/view");
  });

  it("isAttachableImage keys off the mime type", () => {
    expect(isAttachableImage({ type: "image/png" })).toBe(true);
    expect(isAttachableImage({ type: "application/pdf" })).toBe(false);
  });
});
