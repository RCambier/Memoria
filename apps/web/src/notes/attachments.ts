import { uploadFile } from "../api/drive.js";
import { ensureMemoriaFolders } from "../api/folders.js";

/**
 * Image attachments for notes: a pasted or dropped image is uploaded to
 * `Memoria/notes/attachments/` in the user's Drive, and the note embeds it
 * as `![name](drive:<fileId>)` — resolved back through Drive's own CDN
 * thumbnails at render time (`components/Markdown.tsx`). The image is a
 * plain Drive file the user owns, visible in Drive like everything else
 * Memoria stores.
 *
 * Large pastes are downscaled in the browser before upload (retina
 * screenshots easily reach 5–10 MB): faster paste-to-visible, smaller Drive
 * footprint, and it keeps uploads far away from the 5 MB ceiling of Drive's
 * multipart upload. Images below the threshold upload untouched.
 */

/** Only images are accepted as note attachments. */
export function isAttachableImage(file: { type: string }): boolean {
  return file.type.startsWith("image/");
}

/** Above this many bytes an image is re-encoded before upload. */
const DOWNSCALE_BYTES = 1_500_000;
/** Longest edge after downscaling — plenty for any in-app rendering. */
const MAX_EDGE_PX = 2048;
const WEBP_QUALITY = 0.85;

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
  const ext = (uploaded.type.split("/")[1] ?? "png").split("+")[0];
  const named =
    original instanceof File && original.name && original.name !== "image.png" ? original.name : null;
  if (named) {
    // Keep the user's basename but make the extension honest post-re-encode.
    return uploaded === original ? named : `${named.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `pasted-${stamp}.${ext}`;
}

/** Uploads one image (downscaled when large) and returns the markdown that embeds it. */
export async function uploadAttachment(
  token: string,
  file: File | Blob,
): Promise<{ fileId: string; markdown: string }> {
  const folders = await ensureMemoriaFolders(token);
  const blob = await downscaleForUpload(file);
  const name = attachmentName(file, blob);
  const { id } = await uploadFile(token, folders.attachmentsId, name, blob);
  // Alt text must survive the markdown syntax: strip characters that would
  // close the bracket early.
  const alt = name.replace(/[[\]()\n]/g, "");
  return { fileId: id, markdown: `![${alt}](drive:${id})` };
}
