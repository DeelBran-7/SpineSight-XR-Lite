import { cp, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = new URL("node_modules/@mediapipe/tasks-vision/", root);
const wasm = new URL("public/wasm/", root);
await mkdir(wasm, { recursive: true });
await cp(new URL("wasm/", source), wasm, { recursive: true });
