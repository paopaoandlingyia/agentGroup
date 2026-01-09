"use client";

import { useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAsJson, exportAsZip, importFromFile, makeExportFilename } from "@/lib/backup";

interface DataModalProps {
  isOpen: boolean;
  activeSessionId: string | null;
  onClose: () => void;
  onImported: (activeSessionId: string | null) => void | Promise<void>;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DataModal({ isOpen, activeSessionId, onClose, onImported }: DataModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!isOpen) return null;

  const handleExportZip = async () => {
    setIsBusy(true);
    try {
      const blob = await exportAsZip(activeSessionId);
      downloadBlob(blob, makeExportFilename("zip"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportJson = async () => {
    setIsBusy(true);
    try {
      const blob = await exportAsJson(activeSessionId);
      downloadBlob(blob, makeExportFilename("json"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (file: File) => {
    if (!confirm("导入会覆盖当前本地数据（讨论组/消息/Agents）。确定继续吗？")) return;
    setIsBusy(true);
    try {
      const bundle = await importFromFile(file);
      await onImported(bundle.active_session_id ?? null);
      onClose();
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">数据导入/导出</h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isBusy}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
            默认数据保存在浏览器 IndexedDB。导出可用于备份或跨设备迁移；导入会覆盖本地数据。
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportZip} disabled={isBusy}>
              <Download className="h-4 w-4" />
              导出 ZIP
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportJson} disabled={isBusy}>
              <Download className="h-4 w-4" />
              导出 JSON
            </Button>
            <Button className="col-span-2 gap-2" onClick={handleImportClick} disabled={isBusy}>
              <Upload className="h-4 w-4" />
              导入 ZIP / JSON
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />

          <p className="text-[10px] text-muted-foreground">
            提示：如果导出文件很大（含图片），建议使用 ZIP。
          </p>
        </div>
      </div>
    </div>
  );
}
