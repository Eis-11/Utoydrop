import { randomToken } from "./security.js";
import { HttpError } from "./validation.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function actualExtension(bytes, declaredType) {
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const webp = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (declaredType === "image/jpeg" && jpeg) return "jpg";
  if (declaredType === "image/png" && png) return "png";
  if (declaredType === "image/webp" && webp) return "webp";
  return "";
}

export async function uploadImage(c) {
  const contentType = String(c.req.header("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!CONTENT_TYPES.has(contentType)) throw new HttpError(400, "Imagen inválida. Usa JPG, PNG o WebP.");
  const declaredLength = Number(c.req.header("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new HttpError(413, "La imagen debe pesar menos de 2 MB.");
  const data = await c.req.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "La imagen debe pesar menos de 2 MB.");
  const bytes = new Uint8Array(data);
  const extension = actualExtension(bytes, contentType);
  if (!extension) throw new HttpError(400, "El contenido del archivo no coincide con una imagen válida.");
  const key = `${Date.now().toString(36)}-${randomToken(18)}.${extension}`;
  await c.env.PRODUCT_IMAGES.put(key, data, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: `inline; filename="${key}"`,
    },
    customMetadata: { source: "utoy-admin" },
  });
  return { url: `/uploads/${key}` };
}

export async function serveImage(c) {
  const key = c.req.param("key");
  if (!/^[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(key)) throw new HttpError(404, "Imagen no encontrada.");
  const object = await c.env.PRODUCT_IMAGES.get(key);
  if (!object) throw new HttpError(404, "Imagen no encontrada.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const storedType = String(headers.get("Content-Type") || "").toLowerCase();
  headers.set("Content-Type", CONTENT_TYPES.has(storedType) ? storedType : "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
