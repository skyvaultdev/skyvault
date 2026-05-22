"use client";

import { ReactNode } from "react";
import "./PermissionGuard.css";

type Props = {
  allowed: boolean;
  children: ReactNode;
};

export default function PermissionGuard({
  allowed,
  children,
}: Props) {
  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div className="permissionWrapper">
      <div className="permissionBlur">
        {children}
      </div>

      <div className="permissionOverlay">
        <div className="permissionBox">
          <div className="permissionLock">🔒</div>

          <strong>Acesso restrito</strong>

          <p>
            Você não possui permissão para acessar esta área.
          </p>
        </div>
      </div>
    </div>
  );
}