import { getCookie, setCookie } from "hono/cookie";
import { HttpError } from "./validation.js";

export const ADMIN_COOKIE = "utoy_admin";
const encoder = new TextEncoder();

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function safeEqual(supplied, expected) {
  const [left, right] = await Promise.all([sha256(String(supplied || "")), sha256(String(expected || ""))]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function sessionTtlMs(env) {
  const minutes = Number(env.ADMIN_SESSION_TTL_MINUTES || 5);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000;
}

export function writeSessionCookie(c, token, maxAgeSeconds) {
  setCookie(c, ADMIN_COOKIE, token, {
    path: "/api/admin",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  });
}

export async function requireAdmin(c, next) {
  const token = getCookie(c, ADMIN_COOKIE) || "";
  if (!token) throw new HttpError(401, "La sesión expiró. Inicia sesión de nuevo.");
  const tokenHash = await sha256(token);
  const now = Date.now();
  const session = await c.env.DB.prepare(
    "SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?",
  ).bind(tokenHash).first();
  if (!session || Number(session.expires_at) <= now) {
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    throw new HttpError(401, "La sesión expiró. Inicia sesión de nuevo.");
  }
  c.set("adminTokenHash", tokenHash);
  c.set("adminToken", token);
  await next();
}

export async function enforceOrigin(c, next) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(c.req.method)) return next();
  const origin = c.req.header("origin");
  if (!origin) return next();
  const requestOrigin = new URL(c.req.url).origin;
  const allowed = new Set(String(c.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
  allowed.add(requestOrigin);
  if (!allowed.has(origin)) throw new HttpError(403, "Origen no permitido.");
  return next();
}

export async function persistentRateLimit(c, { scope, windowMs, limit, message }) {
  const now = Date.now();
  const source = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const clientHash = await sha256(source);
  const record = await c.env.DB.prepare(`
    INSERT INTO rate_limits (scope, client_hash, window_started_at, reset_at, request_count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(scope, client_hash) DO UPDATE SET
      window_started_at = CASE WHEN rate_limits.reset_at <= excluded.window_started_at THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
      reset_at = CASE WHEN rate_limits.reset_at <= excluded.window_started_at THEN excluded.reset_at ELSE rate_limits.reset_at END,
      request_count = CASE WHEN rate_limits.reset_at <= excluded.window_started_at THEN 1 ELSE rate_limits.request_count + 1 END
    RETURNING request_count, reset_at
  `).bind(scope, clientHash, now, now + windowMs).first();
  if (Number(record.request_count) > limit) {
    c.header("Retry-After", String(Math.max(1, Math.ceil((Number(record.reset_at) - now) / 1000))));
    throw new HttpError(429, message);
  }
}

export async function securityHeaders(c, next) {
  await next();
  c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  c.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Permitted-Cross-Domain-Policies", "none");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (new URL(c.req.url).protocol === "https:") c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}
