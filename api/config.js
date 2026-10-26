export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const ready = Boolean(url && anonKey);
  // Only the Supabase public key is returned. Never return the service-role key.
  return res
    .status(200)
    .json({
      ready,
      url: ready ? url : null,
      anonKey: ready ? anonKey : null,
      leadsReady: ready && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
}
