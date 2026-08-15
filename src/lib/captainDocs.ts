import { supabase } from "./supabase";
import { compressImage } from "./imageCompress";

// يرفع صورة مستند إلى مجلد الكابتن ويعيد المسار المخزّن
export async function uploadCaptainDoc(
  userId: string,
  slot: string,
  file: File
): Promise<string> {
  // ضغط الصورة تلقائيًا قبل الرفع (توفير مساحة وسرعة)
  const compressed = await compressImage(file);
  const path = `${userId}/${slot}.jpg`;
  const { error } = await supabase.storage
    .from("captain-docs")
    .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
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
