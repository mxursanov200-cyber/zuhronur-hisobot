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

async function listEmployees(request, profile, url) {
  if (profile.role !== "manager") return json({ error: "Ruxsat yo‘q" }, 403);
  const department = url.searchParams.get("department");
  if (!["external", "laser", "print"].includes(department)) return json({ error: "Bo‘lim noto‘g‘ri" }, 400);
  const endpoint = `${SB_URL}/rest/v1/profiles?department=eq.${department}&role=eq.employee&select=user_id,full_name,created_at&order=full_name.asc`;
  return proxyJson(await fetch(endpoint, { headers: authHeaders(request) }));
}

async function listPayments(request, profile, url) {
  const selectedOwner = url.searchParams.get("owner_id");
  const params = new URLSearchParams({
    select: "id,employee_id,employee_name,module,week_start,week_end,total_sqm,amount,paid_at,paid_by,created_at",
    order: "week_start.desc",
  });
  if (profile.role === "manager" && selectedOwner) {
    params.set("employee_id", `eq.${selectedOwner}`);
  } else if (profile.role !== "manager") {
    params.set("employee_id", `eq.${profile.user_id}`);
  }
  const response = await fetch(`${SB_URL}/rest/v1/weekly_payments?${params}`, {
    headers: authHeaders(request),
  });
  return proxyJson(response);
}

function mondayOf(dateValue = new Date()) {
  const date = new Date(dateValue);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

async function createPayment(request, profile) {
  if (profile.role !== "manager") return json({ error: "Ruxsat yo‘q" }, 403);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Noto‘g‘ri ma’lumot" }, 400); }
  const employeeId = String(payload.employee_id || "");
  const module = String(payload.module || "");
  const amount = Number(payload.amount);
  const weekStart = String(payload.week_start || mondayOf());
  if (!employeeId || !["external", "laser", "print"].includes(module) || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return json({ error: "To‘lov ma’lumoti to‘liq emas" }, 400);
  }
  const weekEndDate = new Date(`${weekStart}T12:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const profileParams = new URLSearchParams({
    user_id: `eq.${employeeId}`,
    department: `eq.${module}`,
    role: "eq.employee",
    select: "user_id,full_name",
  });
  const employeeResponse = await fetch(`${SB_URL}/rest/v1/profiles?${profileParams}`, { headers: authHeaders(request) });
  if (!employeeResponse.ok) return proxyJson(employeeResponse);
  const employeeRows = await employeeResponse.json();
  if (!employeeRows.length) return json({ error: "Xodim topilmadi" }, 404);

  const cutsParams = new URLSearchParams({
    owner_id: `eq.${employeeId}`,
    module: `eq.${module}`,
    date: `gte.${weekStart}`,
    select: "width,height,qty,category,material",
  });
  cutsParams.append("date", `lte.${weekEnd}`);
  const cutsResponse = await fetch(`${SB_URL}/rest/v1/secure_cuts?${cutsParams}`, { headers: authHeaders(request) });
  if (!cutsResponse.ok) return proxyJson(cutsResponse);
  const cutRows = await cutsResponse.json();
  const unitMaterials = new Set(["Bukva", "Laytboks", "Stella", "Futbolka", "Kepka"]);
  const totalSqm = cutRows.reduce((sum, row) => {
    if (unitMaterials.has(row.material) || String(row.category).includes("unit")) return sum;
    return sum + ((Number(row.width) || 0) * (Number(row.height) || 0) * (Number(row.qty) || 0) / 10000);
  }, 0);
  const record = {
    employee_id: employeeId,
    employee_name: employeeRows[0].full_name,
    module,
    week_start: weekStart,
    week_end: weekEnd,
    total_sqm: Math.round(totalSqm * 100) / 100,
    amount: Math.round(amount * 100) / 100,
    paid_at: new Date().toISOString(),
    paid_by: profile.user_id,
  };
  const params = new URLSearchParams({ on_conflict: "employee_id,module,week_start" });
  const response = await fetch(`${SB_URL}/rest/v1/weekly_payments?${params}`, {
    method: "POST",
    headers: authHeaders(request, { prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(record),
  });
  return proxyJson(response);
}

async function listCuts(request, profile, url) {
  const selectedOwner = url.searchParams.get("owner_id");
  const selectedModule = url.searchParams.get("module");
  const params = new URLSearchParams({
    select: "id,owner_id,owner_name,module,dealer,note,material,category,width,height,qty,date,created_at",
    order: "created_at.desc",
  });
  if (profile.role === "manager" && selectedOwner) {
    if (!["external", "laser", "print", "pechat"].includes(selectedModule)) {
      return json({ error: "Bo‘lim noto‘g‘ri" }, 400);
    }
    const employeeParams = new URLSearchParams({
      user_id: `eq.${selectedOwner}`,
      department: `eq.${selectedModule}`,
      role: "eq.employee",
      select: "user_id",
    });
    const employeeResponse = await fetch(`${SB_URL}/rest/v1/profiles?${employeeParams}`, {
      headers: authHeaders(request),
    });
    if (!employeeResponse.ok) return proxyJson(employeeResponse);
    const employeeRows = await employeeResponse.json();
    if (!employeeRows.length) return json({ error: "Xodim ushbu bo‘limda topilmadi" }, 404);
    params.set("owner_id", `eq.${selectedOwner}`);
    params.set("module", `eq.${selectedModule}`);
  } else if (profile.role !== "manager") {
    const allowedModule = profile.department === "external" && ["laser", "pechat"].includes(selectedModule)
      ? selectedModule
      : profile.department;
    params.set("module", `eq.${allowedModule}`);
    if (!["laser", "pechat"].includes(allowedModule)) params.set("owner_id", `eq.${profile.user_id}`);
  }
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

const designToPechat = new Map([
  ["Banner", "Banner"], ["Orakal", "Orakal"], ["Setka", "Setka"],
  ["Prozrachniy orakal", "Prozrachnyy orakal"], ["Prozrachnyy orakal", "Prozrachnyy orakal"],
  ["Bayroq", "Bayroq"], ["Magnit", "Magnit"], ["Pauk", "Beklint"],
  ["Roll-up", "Beklint"], ["Rol up", "Beklint"],
]);

async function createCuts(request, profile) {
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Noto‘g‘ri ma’lumot" }, 400); }
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const now = new Date().toISOString();
  const rows = rawItems.flatMap((item) => {
    const requestedModule = String(item.module || profile.department);
    const module = profile.role === "manager"
      ? requestedModule
      : profile.department === "external" && ["external", "laser", "pechat"].includes(requestedModule)
        ? requestedModule
        : profile.department;
    const dealer = String(item.dealer || "").trim();
    const note = String(item.note || "").trim();
    const qty = Number(item.qty);
    const requestedPechatQty = Number(item.pechatQty);
    if (!['external', 'laser', 'print', 'pechat'].includes(module) || !(dealer || note) || !item.material || !(qty > 0)) return [];
    const sourceRow = {
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
    };
    const pechatMaterial = module === "external" ? designToPechat.get(sourceRow.material) : null;
    if (pechatMaterial) sourceRow.note = `design-source:${sourceRow.id}`;
    const result = [sourceRow];
    if (pechatMaterial && sourceRow.width > 0 && sourceRow.height > 0) {
      const pechatQty = Number.isFinite(requestedPechatQty) && requestedPechatQty > 0
        ? Math.trunc(requestedPechatQty)
        : sourceRow.qty;
      result.push({
        ...sourceRow,
        id: `${Date.now()}-${crypto.randomUUID()}`,
        module: "pechat",
        material: pechatMaterial,
        category: "design-sync",
        qty: pechatQty,
        width: sourceRow.width + (sourceRow.material === "Banner" ? 9 : 0),
        height: sourceRow.height + (sourceRow.material === "Banner" ? 9 : 0),
        note: `design-sync:${sourceRow.id}`,
      });
    }
    return result;
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
  const lookup = new URLSearchParams(params);
  lookup.set("select", "id,owner_id,module,dealer,note,material,category,width,height,qty,date,created_at");
  const lookupResponse = await fetch(`${SB_URL}/rest/v1/secure_cuts?${lookup}`, {
    headers: authHeaders(request),
  });
  if (!lookupResponse.ok) return proxyJson(lookupResponse);
  const sourceRows = await lookupResponse.json();
  if (sourceRows.some((row) => row.module === "pechat")) {
    return json({ error: "Pechat ma’lumotlarini Pechat bo‘limidan o‘chirib bo‘lmaydi" }, 403);
  }
  for (const row of sourceRows) {
    const pechatMaterial = row.module === "external" && row.category !== "design-sync"
      ? designToPechat.get(row.material)
      : null;
    if (!pechatMaterial) continue;
    const sourceMarker = String(row.note || "").startsWith("design-source:")
      ? String(row.note).slice("design-source:".length)
      : "";
    const linked = sourceMarker
      ? new URLSearchParams({
          owner_id: `eq.${row.owner_id}`,
          module: "eq.pechat",
          category: "eq.design-sync",
          note: `eq.design-sync:${sourceMarker}`,
        })
      : new URLSearchParams({
          owner_id: `eq.${row.owner_id}`,
          module: "eq.pechat",
          category: "eq.design-sync",
          created_at: `eq.${row.created_at}`,
          dealer: `eq.${row.dealer}`,
          material: `eq.${pechatMaterial}`,
          date: `eq.${row.date}`,
          width: `eq.${row.width}`,
          height: row.material === "Banner" ? `in.(${row.height},${Number(row.height) + 9})` : `eq.${row.height}`,
        });
    const linkedResponse = await fetch(`${SB_URL}/rest/v1/secure_cuts?${linked}`, {
      method: "DELETE",
      headers: authHeaders(request, { prefer: "return=minimal" }),
    });
    if (!linkedResponse.ok) return proxyJson(linkedResponse);
  }
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
  if (route === "employees") return listEmployees(request, profile, url);
  if (route === "payments") {
    if (request.method === "GET") return listPayments(request, profile, url);
    if (request.method === "POST") return createPayment(request, profile);
    return json({ error: "Method" }, 405);
  }
  if (route !== "cuts") return json({ error: "Topilmadi" }, 404);
  if (request.method === "GET") return listCuts(request, profile, url);
  if (request.method === "POST") return createCuts(request, profile);
  if (request.method === "DELETE") return deleteCuts(request, profile);
  return json({ error: "Method" }, 405);
}
