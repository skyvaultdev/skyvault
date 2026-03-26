"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import GlobalLoader from "./GlobalLoader";

export default function LoadingHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    (window as any).startGlobalLoading = () => setIsLoading(true);
    (window as any).stopGlobalLoading = () => setIsLoading(false);
  }, []);

  if (!isLoading) return null;
  return <GlobalLoader />;
}