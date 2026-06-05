// Server-only Planning Center Services API wrapper.
// Reuses the existing PCO_APP_ID / PCO_SECRET basic auth credentials.

const PCO_SERVICES_BASE = "https://api.planningcenteronline.com/services/v2";

function authHeader() {
  const id = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) {
    throw new Error("Planning Center is not configured (missing PCO_APP_ID / PCO_SECRET).");
  }
  const token = Buffer.from(`${id}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function pcoFetch(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${PCO_SERVICES_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PCO Services ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function getServiceType(serviceTypeId: string): Promise<{ id: string; name: string }> {
  const json: any = await pcoFetch(`/service_types/${serviceTypeId}`);
  return { id: String(json.data?.id), name: json.data?.attributes?.name ?? "(unnamed)" };
}

// Find the plan whose sort_date matches the requested Sunday (YYYY-MM-DD).
export async function findPlanForDate(
  serviceTypeId: string,
  sundayIso: string,
): Promise<{ id: string; title: string | null; sort_date: string } | null> {
  let next: string | null = `/service_types/${serviceTypeId}/plans?filter=future&per_page=25&order=sort_date`;
  while (next) {
    const json: any = await pcoFetch(next);
    for (const p of json.data ?? []) {
      const sortDate: string | null = p.attributes?.sort_date ?? null;
      if (!sortDate) continue;
      const datePart = sortDate.slice(0, 10);
      if (datePart === sundayIso) {
        return { id: String(p.id), title: p.attributes?.title ?? null, sort_date: sortDate };
      }
      if (datePart > sundayIso) {
        // Plans are ordered by sort_date asc; no need to keep paging.
        return null;
      }
    }
    next = json.links?.next ?? null;
  }
  return null;
}

export type PcoPlanItem = { id: string; title: string; description: string | null };

export async function listPlanItems(serviceTypeId: string, planId: string): Promise<PcoPlanItem[]> {
  const items: PcoPlanItem[] = [];
  let next: string | null = `/service_types/${serviceTypeId}/plans/${planId}/items?per_page=100`;
  while (next) {
    const json: any = await pcoFetch(next);
    for (const it of json.data ?? []) {
      items.push({
        id: String(it.id),
        title: it.attributes?.title ?? "",
        description: it.attributes?.description ?? null,
      });
    }
    next = json.links?.next ?? null;
  }
  return items;
}

export async function updatePlanItemDescription(
  serviceTypeId: string,
  planId: string,
  itemId: string,
  description: string,
) {
  await pcoFetch(`/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "Item",
        id: itemId,
        attributes: { description },
      },
    }),
  });
}
