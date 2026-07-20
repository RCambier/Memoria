import { useEffect, useRef, useState } from "react";
import { useTagColors } from "../lib/tagColor.js";
import { TagChip } from "./TagChip.js";

interface TagsEditorProps {
  tags: string[];
  readOnly?: boolean;
  /** Called with the full next tag list on every add/remove. */
  onChange: (tags: string[]) => void;
}

/**
 * The shared tag editor: colored chips (each recolorable and removable) plus a
 * quiet "+ Add tag" pill. Clicking it reveals a compact inline field — Enter
 * or comma commits and keeps it open for the next tag, Escape or clicking away
 * closes it, Backspace on an empty field peels the last chip off. Used by the
 * add composer and the task detail.
 */
export function TagsEditor({ tags, readOnly, onChange }: TagsEditorProps) {
  const tagClass = useTagColors();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function commitDraft(): void {
    const t = draft.trim().replace(/,/g, "");
    setDraft("");
    if (t !== "" && !tags.includes(t)) onChange([...tags, t]);
  }

  if (readOnly) {
    if (tags.length === 0) return null;
    return (
      <div className="card-tags">
        {tags.map((t) => (
          <TagChip key={t} name={t} colorClass={tagClass(t)} />
        ))}
      </div>
    );
  }

  return (
    <div className="composer-tags">
      {tags.map((t) => (
        <TagChip
          key={t}
          name={t}
          colorClass={tagClass(t)}
          editable
          onRemove={() => onChange(tags.filter((x) => x !== t))}
        />
      ))}
      {adding ? (
        <input
          ref={inputRef}
          type="text"
          className="tag-input"
          placeholder="Tag name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft(); // stay open to add several in a row
            } else if (e.key === "Escape") {
              // Cancel just the tag entry — don't let it bubble to the task
              // detail's window-level Escape handler, which would close the
              // whole dialog. stopImmediatePropagation reaches that native
              // listener; React's stopPropagation alone would not.
              e.preventDefault();
              e.nativeEvent.stopImmediatePropagation();
              setDraft("");
              setAdding(false);
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            commitDraft();
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="tag-add"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
        >
          + Add tag
        </button>
      )}
    </div>
  );
}
