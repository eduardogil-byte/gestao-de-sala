import { X } from "lucide-react";

export function RemoveIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick}
    className="group absolute right-1 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--color-remove-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-remove-line)] bg-[var(--color-remove-soft)] transition-colors group-hover:border-current group-hover:bg-[var(--color-remove-ink)] group-hover:text-surface group-focus-visible:border-current group-focus-visible:bg-[var(--color-remove-ink)] group-focus-visible:text-surface group-active:opacity-80">
      <X aria-hidden="true" size={17} strokeWidth={2.25} />
    </span>
  </button>;
}
