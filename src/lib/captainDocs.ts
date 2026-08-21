import { supabase } from "./supabase";
import { compressImage } from "./imageCompress";

// يرفع صورة مستند مع إعادة محاولة تلقائية عند ضعف الاتصال
export async function uploadCaptainDoc(
  userId: string,
  slot: string,
  file: File
): Promise<string> {
  const { file: compressed, format } = await compressImage(file);
  const ext = format === "webp" ? "webp" : "jpg";
  const contentType = format === "webp" ? "image/webp" : "image/jpeg";
  const path = `${userId}/${slot}.${ext}`;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.storage
        .from("captain-docs")
        .upload(path, compressed, { upsert: true, contentType });
      if (error) throw new Error(error.message);
      return path; // نجح
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error(
    "تعذّر رفع الصورة بعد عدة محاولات — تأكد من ثبات الاتصال بالإنترنت" +
    (lastErr instanceof Error ? ` (${lastErr.message})` : "")
  );
}

// حذف كل مستندات كابتن من التخزين (يُستدعى قبل حذف الحساب)
export async function deleteCaptainDocs(userId: string): Promise<void> {
  const { data } = await supabase.storage.from("captain-docs").list(userId);
  if (data && data.length) {
    const paths = data.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from("captain-docs").remove(paths);
  }
}

// يحصل على رابط مؤقت لعرض صورة مستند (للأدمن أو للكابتن نفسه)
export async function signedDocUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("captain-docs")
    .createSignedUrl(path, 60 * 10); // صالح 10 دقائق
  if (error) return null;
  return data.signedUrl;
}

// يستعيد مسارات المستندات الموجودة فعليًا عند انقطاع التسجيل قبل حفظها في جدول captains.
export async function listCaptainDocPaths(userId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.storage.from("captain-docs").list(userId, {
    limit: 20,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;

  return Object.fromEntries(
    (data || [])
      .filter((file) => file.id)
      .map((file) => {
        const slot = file.name.replace(/\.(?:jpe?g|png|webp)$/i, "");
        return [slot, `${userId}/${file.name}`];
      })
  );
}
