import { Hono } from "hono";
import type { Env } from "./env.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => {
  return c.json({ status: "ok" }, 200);
});

export default app;
