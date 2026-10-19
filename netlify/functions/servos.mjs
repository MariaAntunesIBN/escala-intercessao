import { getStore } from "@netlify/blobs";

export const config = { path: ["/api/servos", "/api/servos/*"] };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  // Proteção por senha (variável de ambiente SENHA_ADMIN no Netlify)
  const senha = Netlify.env.get("SENHA_ADMIN");
  if (!senha) return json({ erro: "SENHA_ADMIN não configurada no Netlify." }, 500);
  if (req.headers.get("x-senha") !== senha) return json({ erro: "Senha inválida." }, 401);

  const store = getStore("servos");
  const lista = (await store.get("lista", { type: "json" })) || [];
  const salvar = (l) => store.setJSON("lista", l);
  const id = new URL(req.url).pathname.split("/").filter(Boolean)[2]; // /api/servos/:id

  const limpar = (b) => ({
    nome: String(b.nome || "").trim().slice(0, 120),
    celular: String(b.celular || "").replace(/\D/g, "").slice(0, 13),
  });

  if (req.method === "GET") return json(lista);

  if (req.method === "POST") {
    const { nome, celular } = limpar(await req.json());
    if (!nome) return json({ erro: "Informe o nome." }, 400);
    const novo = { id: crypto.randomUUID(), nome, celular, ativo: true, criadoEm: new Date().toISOString() };
    lista.push(novo);
    await salvar(lista);
    return json(novo, 201);
  }

  const i = lista.findIndex((s) => s.id === id);
  if (i < 0) return json({ erro: "Servo não encontrado." }, 404);

  if (req.method === "PUT") {
    const b = await req.json();
    if ("nome" in b || "celular" in b) {
      const { nome, celular } = limpar({ nome: b.nome ?? lista[i].nome, celular: b.celular ?? lista[i].celular });
      if (!nome) return json({ erro: "Informe o nome." }, 400);
      lista[i].nome = nome;
      lista[i].celular = celular;
    }
    if (typeof b.ativo === "boolean") lista[i].ativo = b.ativo;
    await salvar(lista);
    return json(lista[i]);
  }

  if (req.method === "DELETE") {
    lista.splice(i, 1);
    await salvar(lista);
    return json({ ok: true });
  }

  return json({ erro: "Método não suportado." }, 405);
};
