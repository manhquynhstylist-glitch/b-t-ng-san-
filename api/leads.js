import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export function validateLead(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const need = typeof body.need === "string" ? body.need.trim() : "";
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^\+?[0-9 ]{9,15}$/.test(phone) ||
    need.length < 10 ||
    need.length > 2000 ||
    body.consent !== true
  )
    return null;
  return { name, phone, need };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Phương thức không được hỗ trợ." });
  }
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key)
    return res
      .status(503)
      .json({
        error:
          "Chức năng nhận nhu cầu chưa được kết nối. Thông tin chưa được gửi; vui lòng thử lại sau.",
      });
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    return res.status(415).json({ error: "Nội dung gửi không hợp lệ." });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host)
        return res.status(403).json({ error: "Nguồn gửi không hợp lệ." });
    } catch {
      return res.status(403).json({ error: "Nguồn gửi không hợp lệ." });
    }
  }
  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
  }
  if (body?.website)
    return res.status(400).json({ error: "Không thể gửi yêu cầu." });
  const lead = validateLead(body);
  if (!lead)
    return res
      .status(400)
      .json({
        error:
          "Vui lòng kiểm tra họ tên, số điện thoại, nhu cầu (10–2.000 ký tự) và đồng ý tư vấn.",
      });
  // Vercel supplies x-real-ip. Never retain raw IP addresses in the database.
  const ip = String(
    req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown",
  );
  const hash = createHash("sha256").update(`${key}:${ip}`).digest("hex");
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc("submit_lead", {
      p_name: lead.name,
      p_phone: lead.phone,
      p_need: lead.need,
      p_request_hash: hash,
    });
    if (error)
      return res
        .status(502)
        .json({
          error:
            "Chưa thể lưu nhu cầu. Thông tin chưa được xác nhận gửi; vui lòng thử lại sau.",
        });
    if (!data) {
      res.setHeader("Retry-After", "3600");
      return res
        .status(429)
        .json({
          error: "Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau một giờ.",
        });
    }
    return res
      .status(201)
      .json({
        ok: true,
        message:
          "Đã nhận nhu cầu. Bộ phận tư vấn có thể xem thông tin trong hệ thống.",
      });
  } catch {
    return res
      .status(502)
      .json({
        error:
          "Kết nối bị gián đoạn. Chưa xác nhận gửi nhu cầu; vui lòng thử lại sau.",
      });
  }
}
