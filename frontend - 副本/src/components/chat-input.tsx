"use client";

import { useRef } from "react";
import { Send, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MentionInput } from "@/components/mention-input";
import { Agent } from "@/types";

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    agents: Agent[];
    disabled?: boolean;
    isLoading?: boolean;
    pendingImages: string[];
    onImageAdd: (base64: string) => void;
    onImageRemove: (index: number) => void;
    placeholder?: string;
}

export function ChatInput({
    value,
    onChange,
    onSubmit,
    agents,
    disabled = false,
    isLoading = false,
    pendingImages,
    onImageAdd,
    onImageRemove,
    placeholder = "输入消息，@Agent 指定发言... (Ctrl+V 粘贴图片)"
}: ChatInputProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImagePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) processImageFile(file);
                break;
            }
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        for (const file of files) {
            if (file.type.startsWith("image/")) {
                processImageFile(file);
            }
        }
        e.target.value = "";
    };

    const processImageFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            if (base64) {
                onImageAdd(base64);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit();
    };

    return (
        <footer className="border-t p-3 sm:p-4 bg-white/80 backdrop-blur">
            {/* Pending Images Preview */}
            {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 max-w-3xl mx-auto">
                    {pendingImages.map((img, idx) => (
                        <div key={idx} className="relative group/img">
                            <img
                                src={img}
                                alt={`pending-${idx}`}
                                className="h-16 w-16 object-cover rounded-lg border shadow-sm"
                            />
                            <button
                                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow"
                                onClick={() => onImageRemove(idx)}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto items-end">
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageSelect}
                />

                {/* Image Upload Button */}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 flex-shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    title="上传图片"
                >
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                </Button>

                <div className="flex-1" onPaste={handleImagePaste}>
                    <MentionInput
                        value={value}
                        onChange={onChange}
                        onSubmit={handleSubmit}
                        agents={agents}
                        disabled={isLoading || disabled}
                        className="w-full"
                        placeholder={disabled ? "请先选择讨论组" : placeholder}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={isLoading || (!value.trim() && pendingImages.length === 0) || disabled}
                    className="h-10 px-4 sm:px-5 shadow-sm flex-shrink-0"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </form>
        </footer>
    );
}
