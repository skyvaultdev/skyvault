"use client";

import { usePathname } from "next/navigation";
import ChatWidget from "./ChatWidget";

type ChatWidgetGateProps = {
  isLoggedIn: boolean;
};

export default function ChatWidgetGate({ isLoggedIn }: ChatWidgetGateProps) {
  const pathname = usePathname();

  if (!isLoggedIn) return null;
  if (pathname?.startsWith("/dashboard")) return null;

  return <ChatWidget />;
}