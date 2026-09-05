import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Modal mínimo sobre `<dialog>` nativo — sin librería externa. `<dialog>`
 * ya trae foco atrapado, cierre con Escape y backdrop nativo del navegador;
 * solo hace falta sincronizar `open`/`close` con el estado de React.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="rounded-lg border border-line bg-ink-900 text-fg p-0 max-w-lg w-[calc(100%-2rem)] backdrop:bg-black/60"
    >
      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-lg text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-sm"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
