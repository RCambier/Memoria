import { useEffect, useState, type ReactNode } from "react";
import { downloadFile, fetchThumbnailLink, thumbnailUrlAt } from "../api/drive.js";
import { parseBlocks, type InlineNode } from "../lib/markdown.js";

/**
 * Renders a note body (`lib/markdown.ts` dialect) as React elements. Images
 * with a `drive:<fileId>` source — pasted attachments — render from Drive's
 * own CDN thumbnails at display size (tens of KB instead of the original,
 * which can be megabytes), falling back to a full authed download when
 * Drive has no thumbnail yet or the short-lived link expired. Plain
 * `https://` images render as ordinary `<img>` tags.
 */

/** thumbnailLink cache: one metadata fetch per attachment per session. */
const thumbLinkCache = new Map<string, Promise<string | null>>();

function thumbLink(token: string, fileId: string): Promise<string | null> {
  let cached = thumbLinkCache.get(fileId);
  if (!cached) {
    cached = fetchThumbnailLink(token, fileId);
    thumbLinkCache.set(fileId, cached);
    cached.catch(() => thumbLinkCache.delete(fileId));
  }
  return cached;
}

/** Object-URL cache for the full-download fallback. */
const driveImageCache = new Map<string, Promise<string>>();

function driveImageUrl(token: string, fileId: string): Promise<string> {
  let cached = driveImageCache.get(fileId);
  if (!cached) {
    cached = downloadFile(token, fileId).then((blob) => URL.createObjectURL(blob));
    driveImageCache.set(fileId, cached);
    cached.catch(() => driveImageCache.delete(fileId));
  }
  return cached;
}

export function DriveImage({
  fileId,
  alt,
  token,
  className = "md-img",
  displayPx = 1600,
}: {
  fileId: string;
  alt: string;
  token: string | null;
  className?: string;
  /** Longest edge the image renders at (× device pixels) — sizes the Drive thumbnail. */
  displayPx?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // The load ladder: Drive's sized thumbnail → thumbnail off a re-fetched
  // link (the signed URL only lasts hours) → full authed download → give up.
  const [attempt, setAttempt] = useState<"thumb" | "thumb-fresh" | "blob">("thumb");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setFailed(false);
    const load = async (): Promise<string> => {
      if (attempt !== "blob") {
        if (attempt === "thumb-fresh") thumbLinkCache.delete(fileId);
        const link = await thumbLink(token, fileId);
        // No thumbnail (e.g. freshly uploaded) — use the full download.
        if (link) return thumbnailUrlAt(link, displayPx);
      }
      return driveImageUrl(token, fileId);
    };
    load()
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (cancelled) return;
        if (attempt !== "blob") setAttempt("blob");
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, fileId, displayPx, attempt]);

  if (url && !failed) {
    return (
      <img
        className={className}
        src={url}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          // A dead <img> src is almost always an expired thumbnail link.
          setUrl(null);
          setAttempt((a) => (a === "thumb" ? "thumb-fresh" : "blob"));
        }}
      />
    );
  }
  return (
    <span className={`md-img-loading${failed ? " failed" : ""}`} role="img" aria-label={alt || "image"}>
      {failed ? "⚠ image unavailable" : alt || "Loading image…"}
    </span>
  );
}

function renderInline(nodes: InlineNode[], token: string | null, keyPrefix = ""): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}${i}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "strong":
        return <strong key={key}>{renderInline(node.children, token, `${key}.`)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, token, `${key}.`)}</em>;
      case "link":
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
          >
            {renderInline(node.children, token, `${key}.`)}
          </a>
        );
      case "image":
        return node.src.startsWith("drive:") ? (
          <DriveImage key={key} fileId={node.src.slice("drive:".length)} alt={node.alt} token={token} />
        ) : (
          <img key={key} className="md-img" src={node.src} alt={node.alt} referrerPolicy="no-referrer" />
        );
    }
  });
}

function renderLines(lines: InlineNode[][], token: string | null): ReactNode[] {
  return lines.flatMap((line, i) => {
    const rendered = renderInline(line, token, `${i}.`);
    return i === 0 ? rendered : [<br key={`br${i}`} />, ...rendered];
  });
}

export function Markdown({ text, token }: { text: string; token: string | null }) {
  const blocks = parseBlocks(text);
  return (
    <div className="markdown">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const H = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
            return <H key={i}>{renderInline(block.children, token)}</H>;
          }
          case "paragraph":
            return <p key={i}>{renderLines(block.lines, token)}</p>;
          case "quote":
            return <blockquote key={i}>{renderLines(block.lines, token)}</blockquote>;
          case "code":
            return (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={i} />;
          case "bullets":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j} className={item.checked !== undefined ? "task-item" : undefined}>
                    {item.checked !== undefined && (
                      <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />
                    )}
                    {renderInline(item.children, token, `${j}.`)}
                  </li>
                ))}
              </ul>
            );
          case "numbered":
            return (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item.children, token, `${j}.`)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
