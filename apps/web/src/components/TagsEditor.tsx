import { useState } from "react";
import { useTagColors } from "../lib/tagColor.js";
import { TagChip } from "./TagChip.js";

interface TagsEditorProps {
  tags: string[];
  readOnly?: boolean;
  /** Called with the full next tag list on every add/remove. */
  onChange: (tags: string[]) => void;
}

/**
 * The tag editor of the task detail: colored chips (each recolorable and
 * removable) plus an "+ Add tag" chip-button that swaps into a focused
 * type-to-add input. Comma or Enter commits a tag and keeps the input open
 * for the next one; Escape or blur closes it back to the button; Backspace
 * on an empty input peels the last tag off.
 */
export function TagsEditor({ tags, readOnly, onChange }: TagsEditorProps) {
  const tagClass = useTagColors();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

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
          autoFocus
          type="text"
          className="tag-input"
          placeholder="Add tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            }
            if (e.key === "Escape") {
              // Cancel tag entry only — don't let the detail sheet close too.
              e.stopPropagation();
              setDraft("");
              setAdding(false);
            }
            if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            commitDraft();
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" className="tag-add" onClick={() => setAdding(true)}>
          + Add tag
        </button>
      )}
    </div>
  );
}
