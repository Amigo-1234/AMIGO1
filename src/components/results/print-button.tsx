"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog (the page has an A4 print stylesheet). */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
