import { getStore } from "@netlify/blobs";

export const config = { path: ["/api/escala", "/api/escala/*"] };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  const store = getStore("escalas");
  const ym = new URL(req.url).pathname.split("/").filter(Boolean)[2]; // /api/escala/AAAA-MM

  // PÚBLICO: qualquer pessoa pode consultar (só nomes e horários, sem telefones)
  if (req.method === "GET") {
    if (!ym) {
      const { blobs } = await store.list();
      return json(blobs.map((b) => b.key).sort());
    }
    return json((await store.get(ym, { type: "json" })) || null);
  }

  // ADMIN: salvar/excluir exige senha
  const senha = Netlify.env.get("SENHA_ADMIN");
  if (!senha) return json({ erro: "SENHA_ADMIN não configurada no Netlify." }, 500);
  if (req.headers.get("x-senha") !== senha) return json({ erro: "Senha inválida." }, 401);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym || "")) return json({ erro: "Mês inválido." }, 400);

  if (req.method === "PUT") {
    const b = await req.json();
    const hora = (h) => (/^\d{2}:\d{2}$/.test(h) ? h : "");
    const linhas = (Array.isArray(b.linhas) ? b.linhas : []).slice(0, 120).map((l) => ({
      d: Math.min(31, Math.max(1, parseInt(l.d) || 1)),
      w: Math.min(6, Math.max(0, parseInt(l.w) || 0)),
      i: hora(l.i),
      f: hora(l.f),
      nome: String(l.nome || "").trim().slice(0, 120),
    }));
    await store.setJSON(ym, linhas);
    return json({ ok: true, total: linhas.length });
  }

  if (req.method === "DELETE") {
    await store.delete(ym);
    return json({ ok: true });
  }

  return json({ erro: "Método não suportado." }, 405);
};
