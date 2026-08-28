import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

/**
 * Compress client-side to ~300KB/1600px WebP before upload — a raw 12MP
 * phone photo on campus wifi is a 10-second stall that makes people abandon
 * the add-item flow. Path is {user_id}/{random}.webp to match the storage
 * RLS policy in 0006_rls.sql (owner-write, path-scoped by folder).
 */
export async function uploadItemPhoto(file: File, userId: string): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/webp",
  });

  const supabase = createClient();
  const path = `${userId}/${crypto.randomUUID()}.webp`;

  const { error } = await supabase.storage.from("item-photos").upload(path, compressed, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
  return data.publicUrl;
}
