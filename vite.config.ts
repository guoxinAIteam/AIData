import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { createSkillsProxyPlugin } from "./dev/skillsProxy";
import { createCapabilityApiPlugin } from "./dev/capabilityApi";
import { createText2SQLProxyPlugin } from "./dev/text2sqlProxy";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      createText2SQLProxyPlugin(),
      createSkillsProxyPlugin(),
      createCapabilityApiPlugin(),
    ],
  };
});
