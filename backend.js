import { createClient } from "@supabase/supabase-js";
let client = null;
let configuration = { ready: false, leadsReady: false };
export function getClient() {
  return client;
}
export function getConfig() {
  return configuration;
}
export async function initialize() {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) throw Error("config");
    const data = await res.json();
    if (data.ready && /^https:\/\//.test(data.url) && data.anonKey) {
      configuration = data;
      client = createClient(data.url, data.anonKey);
    }
  } catch {
    configuration = { ready: false, leadsReady: false };
  }
  return configuration;
}
export async function sendLead(payload) {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("Chưa thể kết nối bộ phận tư vấn. Thông tin chưa được gửi.");
  }
  if (!response.ok || !result.ok)
    throw Error(result.error || "Chưa thể gửi nhu cầu. Vui lòng thử lại sau.");
  return result;
}
export const listingImage = (path) =>
  client?.storage.from("listing-images").getPublicUrl(path).data.publicUrl;
export function safeAuthError(error) {
  const text = String(error?.message || "");
  if (/invalid login credentials/i.test(text))
    return "Email hoặc mật khẩu không đúng.";
  if (/email not confirmed/i.test(text))
    return "Vui lòng xác nhận email trước khi đăng nhập.";
  if (/already registered|already been registered/i.test(text))
    return "Email này đã được sử dụng. Hãy đăng nhập hoặc đặt lại mật khẩu.";
  if (/rate limit|too many/i.test(text))
    return "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.";
  if (/password.*weak|password.*least/i.test(text))
    return "Vui lòng dùng mật khẩu mạnh hơn (ít nhất 8 ký tự).";
  return "Chưa thể hoàn tất thao tác. Vui lòng kiểm tra kết nối và thử lại.";
}
