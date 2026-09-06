import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // web/ is deployed as its own Vercel project inside the Aether-AI monorepo
  // (see docs/Deployment.md); pin the workspace root so Turbopack doesn't
  // guess wrong from the sibling package-lock.json at the repo root.
  turbopack: { root: __dirname },
};

export default nextConfig;
