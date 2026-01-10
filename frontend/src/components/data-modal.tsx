"use client";

import { useRef, useState } from "react";
import { Download, Upload, X, Settings2, Globe, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAsJson, exportAsZip, importFromFile, makeExportFilename } from "@/lib/backup";

interface DataModalProps {
  isOpen: boolean;
  activeSessionId: string | null;
  onClose: () => void;
  onImported: (activeSessionId: string | null) => void | Promise<void>;
  // 新增 proxy 属性
  useProxy: boolean;
  onUseProxyChange: (val: boolean) => void;
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

export function DataModal({
  isOpen,
  activeSessionId,
  onClose,
  onImported,
  useProxy,
  onUseProxyChange
}: DataModalProps) {
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
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">系统设置</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isBusy} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6">
          {/* Section 1: Network Mode */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <Globe className="h-4 w-4" /> 网络请求模式
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{useProxy ? '代理转发模式' : '浏览器直连模式'}</span>
                  <span className="text-[11px] text-muted-foreground">影响跨域请求与超时限制</span>
                </div>
                <button
                  onClick={() => onUseProxyChange(!useProxy)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${useProxy ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useProxy ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-background/50 p-2 text-[11px] text-muted-foreground border border-dashed">
                <ShieldCheck className="h-3 w-3 mt-0.5 flex-shrink-0 text-primary/70" />
                <p className="leading-tight">
                  {useProxy
                    ? "通过 Vercel/Cloudflare 转发，解决绝大多数 CORS 跨域问题，但受限于服务商的 10s-30s 超时时长。"
                    : "跳过代理直接向 API 发起请求。速度最快且无中转超时，但要求 API Base URL 必须显式支持 CORS。"}
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Data Management */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <Download className="h-4 w-4" /> 数据导出与导入
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed italic">
                默认数据保存在本地 IndexedDB。导出可用于备份或跨设备迁移；导入会覆盖当前所有本地数据。
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExportZip} disabled={isBusy}>
                  <Download className="h-3.5 w-3.5" />
                  导出 ZIP
                </Button>
                <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExportJson} disabled={isBusy}>
                  <Download className="h-3.5 w-3.5" />
                  导出 JSON
                </Button>
                <Button size="sm" className="col-span-2 gap-2 text-xs shadow-sm" onClick={handleImportClick} disabled={isBusy}>
                  <Upload className="h-3.5 w-3.5" />
                  从备份文件恢复 (ZIP / JSON)
                </Button>
              </div>
            </div>
          </section>

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
        </div>
      </div>
    </div>
  );
}
