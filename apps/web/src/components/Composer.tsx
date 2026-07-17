import { TaskForm, type TaskFormValues } from "./TaskForm.js";

export interface NewTaskInput {
  title: string;
  notes?: string;
  dueDate?: string;
  tags?: string[];
}

interface ComposerProps {
  onSubmit: (input: NewTaskInput) => void;
  onCancel: () => void;
}

/** Inline top-of-column task composer — the empty-form case of `TaskForm`. */
export function Composer({ onSubmit, onCancel }: ComposerProps) {
  function handleSubmit(values: TaskFormValues): void {
    onSubmit({
      title: values.title,
      notes: values.notes || undefined,
      dueDate: values.dueDate || undefined,
      tags: values.tags.length > 0 ? values.tags : undefined,
    });
  }

  return <TaskForm submitLabel="Add task" onSubmit={handleSubmit} onCancel={onCancel} />;
}
