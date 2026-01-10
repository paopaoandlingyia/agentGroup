/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 将前端 API 请求代理到后端
  // 这样可以避免创建大量简单透传的 API 路由文件
  // 移除 rewrites，使用 Next.js 原生 API 路由
};

export default nextConfig;

