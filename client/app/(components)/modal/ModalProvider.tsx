"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import "./GlobalDialog.css";

type AlertOptions = { title?: string; confirmLabel?: string };
type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

type ModalContextValue = {
  alert: (message: string, options?: AlertOptions) => Promise<void>;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
};

const ModalContext = createContext<ModalContextValue | null>(null);

type DialogState =
  | { kind: "alert"; message: string; options?: AlertOptions; resolve: (value: void) => void }
  | { kind: "confirm"; message: string; options?: ConfirmOptions; resolve: (value: boolean) => void }
  | null;

// Substitui window.alert/window.confirm (feios, fora do tema do site) por
// um modal de verdade, usando .modalOverlay/.modalContent (o mesmo padrão
// já usado em Pedidos, Orders, chat) — mas montado UMA vez no layout raiz,
// então funciona em qualquer página (loja pública, dashboard, checkout)
// sem cada componente precisar do próprio state de modal.
export function ModalProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const alert = useCallback((message: string, options?: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setDialog({ kind: "alert", message, options, resolve });
    });
  }, []);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ kind: "confirm", message, options, resolve });
    });
  }, []);

  function close(result: boolean) {
    setDialog((current) => {
      if (!current) return null;
      if (current.kind === "alert") current.resolve();
      else current.resolve(result);
      return null;
    });
  }

  return (
    <ModalContext.Provider value={{ alert, confirm }}>
      {children}
      {dialog && (
        <div className="modalOverlay" onClick={() => close(false)}>
          <div className="modalContent globalDialog" onClick={(e) => e.stopPropagation()}>
            {dialog.options?.title && <h4>{dialog.options.title}</h4>}
            <p className="globalDialogMessage">{dialog.message}</p>
            <div className="globalDialogActions">
              {dialog.kind === "confirm" && (
                <button type="button" className="globalDialogBtn globalDialogBtnSecondary" onClick={() => close(false)}>
                  {dialog.options?.cancelLabel ?? "Cancelar"}
                </button>
              )}
              <button
                type="button"
                className={`globalDialogBtn ${dialog.kind === "confirm" && dialog.options?.danger ? "globalDialogBtnDanger" : "globalDialogBtnPrimary"}`}
                onClick={() => close(true)}
              >
                {dialog.options?.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal() precisa estar dentro de <ModalProvider>.");
  return ctx;
}
