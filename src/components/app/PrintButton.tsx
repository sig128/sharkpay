"use client";

import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      Print receipt
    </Button>
  );
}
