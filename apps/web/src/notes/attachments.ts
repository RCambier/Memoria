import { uploadFile } from "../api/drive.js";
import { attachmentsFolderForKind, ensureMemoriaFolders } from "../api/folders.js";

/**
 * File attachments: anything pasted, dropped, or picked on a note or a task
 * is uploaded to `Memoria/notes/attachments/` or `Memoria/todos/attachments/`
 * in the user's Drive, then referenced from the sheet as plain text:
 *
 * - a note **image** embeds as `![name](drive:<fileId>)` and renders inline
 *   through Drive's CDN thumbnails (`components/Markdown.tsx`);
 * - any **other file** on a note embeds as a markdown link
 *   `[📎 name](https://drive.google.com/…)`;
 * - a file on a **task** appends a `📎 name — url` line to the description
 *   (tasks are plain text; `Linkify` makes the URL clickable, and it works
 *   from the sheet itself too).
 *
 * Attachments are ordinary Drive files the user owns. Large images are
 * downscaled in the browser before upload (retina screenshots easily reach
 * 5–10 MB): faster paste-to-visible, smaller Drive footprint, and far under
 * the 5 MB ceiling of Drive's multipart upload — which other file types
 * can't dodge, so they're refused above it with a clear message.
 */

/** Images get inline rendering; everything else becomes a link. */
export function isAttachableImage(file: { type: string }): boolean {
  return file.type.startsWith("image/");
}

/** Drive's multipart upload rejects bodies over ~5 MB; refuse just under it. */
const MULTIPART_LIMIT_BYTES = 4_500_000;

/** Above this many bytes an image is re-encoded before upload. */
const DOWNSCALE_BYTES = 1_500_000;
/** Longest edge after downscaling — plenty for any in-app rendering. */
const MAX_EDGE_PX = 2048;
const WEBP_QUALITY = 0.85;

/** The shareable "open in Drive" URL for an uploaded file. Pure; tested. */
export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Markdown a note embeds for an attachment. Pure; tested. */
export function noteAttachmentMarkdown(name: string, fileId: string, isImage: boolean): string {
  // The label must survive the markdown syntax: strip characters that would
  // close the bracket early.
  const label = name.replace(/[[\]()\n]/g, "");
  return isImage ? `![${label}](drive:${fileId})` : `[📎 ${label}](${driveFileUrl(fileId)})`;
}

/** The description line a task gets for an attachment. Pure; tested. */
export function taskAttachmentLine(name: string, fileId: string): string {
  return `📎 ${name.replace(/\n/g, " ")} — ${driveFileUrl(fileId)}`;
}

/**
 * Re-encodes a large image to WebP at ≤2048px on the longest edge. Returns
 * the original when it's already small, animated (GIF — a canvas would
 * freeze it), undecodable, or when re-encoding doesn't actually shrink it.
 */
async function downscaleForUpload(file: File | Blob): Promise<Blob> {
  if (file.size <= DOWNSCALE_BYTES || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    if (out && out.size < file.size) return out;
  } catch {
    // Decode/encode failed — upload the original as-is.
  }
  return file;
}

function attachmentName(original: File | Blob, uploaded: Blob): string {
  const named =
    original instanceof File && original.name && original.name !== "image.png" ? original.name : null;
  if (named && uploaded === original) return named;
  const ext = (uploaded.type.split("/")[1] ?? "bin").split("+")[0];
  if (named) {
    // Keep the user's basename but make the extension honest post-re-encode.
    return `${named.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `pasted-${stamp}.${ext}`;
}

async function uploadToKind(
  token: string,
  kind: "board" | "notes",
  file: File | Blob,
): Promise<{ fileId: string; name: string; isImage: boolean }> {
  const isImage = isAttachableImage(file);
  const blob = isImage ? await downscaleForUpload(file) : file;
  if (blob.size > MULTIPART_LIMIT_BYTES) {
    const mb = (blob.size / 1_000_000).toFixed(1);
    throw new Error(`it's ${mb} MB — attachments cap at ~5 MB.`);
  }
  const folders = await ensureMemoriaFolders(token);
  const name = attachmentName(file, blob);
  const { id } = await uploadFile(token, attachmentsFolderForKind(folders, kind), name, blob);
  return { fileId: id, name, isImage };
}

/** Uploads one file for a note and returns the markdown that embeds it. */
export async function uploadNoteAttachment(
  token: string,
  file: File | Blob,
): Promise<{ fileId: string; markdown: string }> {
  const { fileId, name, isImage } = await uploadToKind(token, "notes", file);
  return { fileId, markdown: noteAttachmentMarkdown(name, fileId, isImage) };
}

/** Uploads one file for a task and returns the description line that links it. */
export async function uploadTaskAttachment(
  token: string,
  file: File | Blob,
): Promise<{ fileId: string; line: string }> {
  const { fileId, name } = await uploadToKind(token, "board", file);
  return { fileId, line: taskAttachmentLine(name, fileId) };
}
