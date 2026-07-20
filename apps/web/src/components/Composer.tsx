import { TaskForm, type TaskFormValues } from "./TaskForm.js";

export interface NewTaskInput {
  title: string;
  notes?: string;
  dueDate?: string;
  blockedUntil?: string;
  tags?: string[];
}

interface ComposerProps {
  token: string | null;
  onSubmit: (input: NewTaskInput) => void;
  onCancel: () => void;
}

/** Inline top-of-column task composer — the empty-form case of `TaskForm`. */
export function Composer({ token, onSubmit, onCancel }: ComposerProps) {
  function handleSubmit(values: TaskFormValues): void {
    onSubmit({
      title: values.title,
      notes: values.notes || undefined,
      dueDate: values.dueDate || undefined,
      blockedUntil: values.blockedUntil || undefined,
      tags: values.tags.length > 0 ? values.tags : undefined,
    });
  }

  return <TaskForm token={token} submitLabel="Add task" onSubmit={handleSubmit} onCancel={onCancel} />;
}
