"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import { useState, useCallback, memo } from "react";

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

// 代码块组件
const CodeBlock = memo(function CodeBlock({
    language,
    children,
}: {
    language: string;
    children: string;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    }, [children]);

    return (
        <div className="relative group my-3 rounded-lg overflow-hidden border border-border/50 bg-[#282c34]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] text-xs text-gray-400 border-b border-border/30">
                <span className="font-mono">{language || "code"}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                    title="复制代码"
                >
                    {copied ? (
                        <>
                            <Check className="h-3 w-3 text-green-400" />
                            <span className="text-green-400">已复制</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3 w-3" />
                            <span>复制</span>
                        </>
                    )}
                </button>
            </div>
            {/* Code Content */}
            <SyntaxHighlighter
                style={oneDark}
                language={language || "text"}
                PreTag="div"
                customStyle={{
                    margin: 0,
                    padding: "1rem",
                    background: "transparent",
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    );
});

// 主渲染组件
export const MarkdownRenderer = memo(function MarkdownRenderer({
    content,
    className = "",
}: MarkdownRendererProps) {
    return (
        <div className={`markdown-body ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // 代码块
                    code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeContent = String(children).replace(/\n$/, "");

                        if (!inline && (match || codeContent.includes("\n"))) {
                            return (
                                <CodeBlock language={match?.[1] || ""}>
                                    {codeContent}
                                </CodeBlock>
                            );
                        }
                        // 行内代码
                        return (
                            <code
                                className="px-1.5 py-0.5 rounded bg-muted/80 text-[0.9em] font-mono text-primary/90 border border-border/50"
                                {...props}
                            >
                                {children}
                            </code>
                        );
                    },
                    // 链接 - 新窗口打开
                    a({ href, children }) {
                        return (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600 underline underline-offset-2 decoration-blue-300/50 hover:decoration-blue-400 transition-colors"
                            >
                                {children}
                            </a>
                        );
                    },
                    // 表格样式
                    table({ children }) {
                        return (
                            <div className="my-3 overflow-x-auto rounded-lg border border-border/50">
                                <table className="w-full text-sm">{children}</table>
                            </div>
                        );
                    },
                    thead({ children }) {
                        return <thead className="bg-muted/50">{children}</thead>;
                    },
                    th({ children }) {
                        return (
                            <th className="px-3 py-2 text-left font-semibold border-b border-border/50">
                                {children}
                            </th>
                        );
                    },
                    td({ children }) {
                        return (
                            <td className="px-3 py-2 border-b border-border/30">{children}</td>
                        );
                    },
                    // 引用块
                    blockquote({ children }) {
                        return (
                            <blockquote className="my-3 pl-4 border-l-4 border-primary/30 text-muted-foreground italic bg-muted/20 py-2 pr-3 rounded-r-lg">
                                {children}
                            </blockquote>
                        );
                    },
                    // 列表
                    ul({ children }) {
                        return (
                            <ul className="my-2 ml-4 list-disc space-y-1 marker:text-primary/60">
                                {children}
                            </ul>
                        );
                    },
                    ol({ children }) {
                        return (
                            <ol className="my-2 ml-4 list-decimal space-y-1 marker:text-primary/60">
                                {children}
                            </ol>
                        );
                    },
                    li({ children }) {
                        return <li className="pl-1">{children}</li>;
                    },
                    // 标题
                    h1({ children }) {
                        return (
                            <h1 className="text-xl font-bold mt-4 mb-2 pb-1 border-b border-border/50">
                                {children}
                            </h1>
                        );
                    },
                    h2({ children }) {
                        return (
                            <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>
                        );
                    },
                    h3({ children }) {
                        return (
                            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
                        );
                    },
                    // 段落
                    p({ children }) {
                        return <p className="my-1.5 leading-relaxed">{children}</p>;
                    },
                    // 分割线
                    hr() {
                        return <hr className="my-4 border-border/50" />;
                    },
                    // 图片
                    img({ src, alt }) {
                        return (
                            <img
                                src={src}
                                alt={alt || ""}
                                className="max-w-full h-auto rounded-lg my-2 border border-border/30 shadow-sm"
                                loading="lazy"
                            />
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

export default MarkdownRenderer;
