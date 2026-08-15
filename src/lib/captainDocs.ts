import { supabase } from "./supabase";

// يرفع صورة مستند إلى مجلد الكابتن ويعيد المسار المخزّن
export async function uploadCaptainDoc(
  userId: string,
  slot: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${slot}.${ext}`;
  const { error } = await supabase.storage
    .from("captain-docs")
    .upload(path, file, { upsert: true, contentType: file.type });
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
