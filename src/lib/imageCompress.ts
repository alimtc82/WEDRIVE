// يضغط الصورة في المتصفح قبل الرفع: تصغير الأبعاد + تحويل WebP (أصغر من JPEG).
// النتيجة عادةً أقل من 200 كيلوبايت بجودة ممتازة للقراءة.
export interface CompressResult {
  file: File;
  format: "webp" | "jpeg";
}

export async function compressImage(
  file: File,
  maxSize = 1280,
  quality = 0.8
): Promise<CompressResult> {
  if (!file.type.startsWith("image/")) return { file, format: "jpeg" };

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > maxSize || height > maxSize) {
    if (width >= height) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    } else {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, format: "jpeg" };
  ctx.drawImage(img, 0, 0, width, height);

  // جرّب WebP أولًا (أصغر حجمًا)، ولو المتصفح لا يدعمه استخدم JPEG
  let blob = await toBlob(canvas, "image/webp", quality);
  let format: "webp" | "jpeg" = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob(canvas, "image/jpeg", quality);
    format = "jpeg";
  }
  if (!blob) return { file, format: "jpeg" };

  const ext = format === "webp" ? ".webp" : ".jpg";
  const name = file.name.replace(/\.[^.]+$/, "") + ext;
  const out = new File([blob], name, { type: blob.type });
  return { file: out, format };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
