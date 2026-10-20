import { getStore } from "@netlify/blobs";

export const config = { path: ["/api/servos", "/api/servos/*"] };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  // Proteção por senha (variável de ambiente SENHA_ADMIN no Netlify)
  const senha = Netlify.env.get("SENHA_ADMIN");
  if (!senha) return json({ erro: "SENHA_ADMIN não configurada no Netlify." }, 500);
  if (req.headers.get("x-senha") !== senha) return json({ erro: "Senha inválida." }, 401);

  const store = getStore({ name: "servos", consistency: "strong" });
  const lista = (await store.get("lista", { type: "json" })) || [];
  const salvar = (l) => store.setJSON("lista", l);
  const id = new URL(req.url).pathname.split("/").filter(Boolean)[2]; // /api/servos/:id

  // Um casal é cadastrado como um único servo (ex.: "Aníbal e Fabíola").
  const ehCasal = (nome) => /\be\b/i.test(String(nome || ""));
  const tipoDe = (b) =>
    b.tipo === "casal" || b.tipo === "individual"
      ? b.tipo
      : ehCasal(b.nome)
        ? "casal"
        : "individual";
  const limpar = (b) => ({
    nome: String(b.nome || "").trim().slice(0, 120),
    celular: String(b.celular || "").replace(/\D/g, "").slice(0, 13),
    tipo: tipoDe(b),
  });

  if (req.method === "GET") return json(lista.map((s) => ({ tipo: tipoDe(s), ...s })));

  if (req.method === "POST") {
    const { nome, celular, tipo } = limpar(await req.json());
    if (!nome) return json({ erro: "Informe o nome." }, 400);
    const novo = { id: crypto.randomUUID(), nome, celular, tipo, ativo: true, criadoEm: new Date().toISOString() };
    lista.push(novo);
    await salvar(lista);
    return json(novo, 201);
  }

  const i = lista.findIndex((s) => s.id === id);
  if (i < 0) return json({ erro: "Servo não encontrado." }, 404);

  if (req.method === "PUT") {
    const b = await req.json();
    if ("nome" in b || "celular" in b || "tipo" in b) {
      const { nome, celular, tipo } = limpar({ nome: b.nome ?? lista[i].nome, celular: b.celular ?? lista[i].celular, tipo: b.tipo ?? lista[i].tipo });
      if (!nome) return json({ erro: "Informe o nome." }, 400);
      lista[i].nome = nome;
      lista[i].celular = celular;
      lista[i].tipo = tipo;
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
