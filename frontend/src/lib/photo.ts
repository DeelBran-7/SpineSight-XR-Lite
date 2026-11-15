export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_BY_EXTENSION: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function checkPhoto(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const type = file.type || MIME_BY_EXTENSION[extension] || "";
  if (!TYPES.has(type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Choose a photo that is 8 MB or smaller.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error("This photo could not be opened. Choose another photo."); });
    if (image.naturalWidth * image.naturalHeight > 20_000_000 || Math.max(image.naturalWidth, image.naturalHeight) > 8192) {
      throw new Error("Choose a photo under 20 megapixels and no larger than 8,192 pixels on either side.");
    }
  } finally {
    URL.revokeObjectURL(url);
  }
  return file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}
