"use client";

import { Button } from "@/components/ui/button";
import { exportCSV, exportJSON } from "@/lib/export";

export function ExportButtons({
  data,
  filename,
}: {
  data: Record<string, unknown>[];
  filename: string;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="default" onClick={() => exportCSV(data, filename)}>
        Descargar CSV
      </Button>
      <Button variant="ghost" onClick={() => exportJSON(data, filename)}>
        Descargar JSON
      </Button>
    </div>
  );
}
