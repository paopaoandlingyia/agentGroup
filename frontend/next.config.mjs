/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 将前端 API 请求代理到后端
  // 这样可以避免创建大量简单透传的 API 路由文件
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    return [
      // 后端 API 代理
      {
        source: "/api/agents",
        destination: `${backendUrl}/agents`,
      },
      {
        source: "/api/sessions",
        destination: `${backendUrl}/sessions`,
      },
      {
        source: "/api/sessions/:path*",
        destination: `${backendUrl}/sessions/:path*`,
      },
      {
        source: "/api/chat",
        destination: `${backendUrl}/chat/data`,
      },
      {
        source: "/api/invoke",
        destination: `${backendUrl}/invoke`,
      },
      {
        source: "/api/message",
        destination: `${backendUrl}/message`,
      },
    ];
  },
};

export default nextConfig;

