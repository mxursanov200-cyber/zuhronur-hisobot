const SB_URL = "https://tpcpwurbnpuisqtfnswf.supabase.co";
const SB_KEY = "sb_publishable_pvhHSd2dMQCfYvDmiun4MQ_dC6iY7lN";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

function authHeaders(request, extra = {}) {
  return {
    apikey: SB_KEY,
    authorization: request.headers.get("authorization") || "",
    "content-type": "application/json",
    ...extra,
  };
}

async function getIdentity(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const userResponse = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_KEY, authorization },
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await fetch(
    `${SB_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,email,full_name,department,role`,
    { headers: authHeaders(request) },
  );
  if (!profileResponse.ok) return null;
  const profiles = await profileResponse.json();
  return profiles[0] || null;
}

async function proxyJson(response) {
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function listEmployees(request, profile) {
  if (profile.role !== "manager") return json({ error: "Ruxsat yo‘q" }, 403);
  const url = `${SB_URL}/rest/v1/profiles?department=eq.external&role=eq.employee&select=user_id,full_name,created_at&order=full_name.asc`;
  return proxyJson(await fetch(url, { headers: authHeaders(request) }));
}

async function listCuts(request, profile, url) {
  const selectedOwner = url.searchParams.get("owner_id");
  const params = new URLSearchParams({
    select: "id,owner_id,owner_name,module,dealer,note,material,category,width,height,qty,date,created_at",
    order: "created_at.desc",
  });
  if (profile.role === "manager" && selectedOwner) params.set("owner_id", `eq.${selectedOwner}`);
  const response = await fetch(`${SB_URL}/rest/v1/secure_cuts?${params}`, {
    headers: authHeaders(request),
  });
  if (!response.ok) return proxyJson(response);
  const rows = await response.json();
  return json(rows.map((row) => ({
    ...row,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
  })));
}

async function createCuts(request, profile) {
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Noto‘g‘ri ma’lumot" }, 400); }
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const now = new Date().toISOString();
  const rows = rawItems.flatMap((item) => {
    const module = profile.role === "manager" ? String(item.module || "laser") : profile.department;
    const dealer = String(item.dealer || "").trim();
    const note = String(item.note || "").trim();
    const qty = Number(item.qty);
    if (!['external', 'laser', 'print'].includes(module) || !(dealer || note) || !item.material || !(qty > 0)) return [];
    return [{
      id: `${Date.now()}-${crypto.randomUUID()}`,
      owner_id: profile.user_id,
      owner_name: profile.full_name,
      owner_email: profile.email,
      module,
      dealer,
      note,
      material: String(item.material),
      category: String(item.category || "material"),
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      qty: Math.trunc(qty),
      date: item.date || now.slice(0, 10),
      created_at: now,
    }];
  });
  if (!rows.length) return json({ error: "Ma’lumot yo‘q" }, 400);
  const response = await fetch(`${SB_URL}/rest/v1/secure_cuts`, {
    method: "POST",
    headers: authHeaders(request, { prefer: "return=minimal" }),
    body: JSON.stringify(rows),
  });
  return response.ok ? json({ ok: true }, 201) : proxyJson(response);
}

async function deleteCuts(request, profile) {
  let payload = {};
  try { payload = await request.json(); } catch {}
  const ids = Array.isArray(payload.ids)
    ? [...new Set(payload.ids.map((id) => String(id).trim()).filter(Boolean))]
    : [];
  if (!ids.length || ids.length > 200) {
    return json({ error: "Tanlanmagan" }, 400);
  }
  const encodedIds = ids.map((id) => `"${id.replaceAll('"', '')}"`).join(",");
  const params = new URLSearchParams({ id: `in.(${encodedIds})` });
  if (profile.role !== "manager") params.set("owner_id", `eq.${profile.user_id}`);
  const response = await fetch(`${SB_URL}/rest/v1/secure_cuts?${params}`, {
    method: "DELETE",
    headers: authHeaders(request, { prefer: "return=minimal" }),
  });
  return response.ok ? json({ ok: true }) : proxyJson(response);
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(request.url);
  const route = url.pathname.split("/").filter(Boolean).at(-1);
  const profile = await getIdentity(request);
  if (!profile) return json({ error: "Kirish talab qilinadi" }, 401);
  if (route === "me") return json(profile);
  if (route === "employees") return listEmployees(request, profile);
  if (route !== "cuts") return json({ error: "Topilmadi" }, 404);
  if (request.method === "GET") return listCuts(request, profile, url);
  if (request.method === "POST") return createCuts(request, profile);
  if (request.method === "DELETE") return deleteCuts(request, profile);
  return json({ error: "Method" }, 405);
}
