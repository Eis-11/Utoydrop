function securityHeaders(req, res, next) {
  res.set({
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  });
  if (req.secure || req.get("x-forwarded-proto") === "https") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function sameOrigin(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    if (new URL(origin).host === req.get("host")) return next();
  } catch {}
  return res.status(403).json({ message: "Origen no permitido." });
}

function rateLimit({ windowMs, limit, message }) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (clients.size > 10_000) {
      for (const [client, record] of clients) {
        if (record.resetAt <= now) clients.delete(client);
      }
      while (clients.size > 10_000) clients.delete(clients.keys().next().value);
    }
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const record = clients.get(key);
    if (!record || record.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count += 1;
    if (record.count <= limit) return next();
    res.set("Retry-After", String(Math.ceil((record.resetAt - now) / 1000)));
    return res.status(429).json({ message });
  };
}

module.exports = { rateLimit, sameOrigin, securityHeaders };
