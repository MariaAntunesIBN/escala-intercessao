import { getStore } from "@netlify/blobs";

export const config = { path: "/api/backup" };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const mesValido = (ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
const horaValida = (hora) =>
  typeof hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);

function validarBackup(backup) {
  if (
    !backup ||
    backup.app !== "escala-intercessao" ||
    backup.schemaVersion !== 1 ||
    !Array.isArray(backup.servos) ||
    !backup.escalas ||
    typeof backup.escalas !== "object" ||
    Array.isArray(backup.escalas)
  ) {
    throw new Error("Arquivo de backup inválido ou incompatível.");
  }

  if (backup.servos.length > 2400) throw new Error("O backup excede o limite de servos.");
  const ids = new Set();
  const servos = backup.servos.map((servo) => {
    const id = String(servo?.id || "").trim();
    const nome = String(servo?.nome || "").trim().slice(0, 120);
    if (!id || id.length > 100 || !nome) throw new Error("Há um servo inválido no backup.");
    if (ids.has(id)) throw new Error("O backup contém IDs de servos repetidos.");
    ids.add(id);
    const celular = String(servo.celular || "").replace(/\D/g, "").slice(0, 13);
    const tipo =
      servo.tipo === "casal" || servo.tipo === "individual"
        ? servo.tipo
        : /\be\b/i.test(nome)
          ? "casal"
          : "individual";
    return {
      id,
      nome,
      celular,
      tipo,
      ativo: servo.ativo !== false,
      criadoEm: String(servo.criadoEm || "").slice(0, 40),
    };
  });

  const chaves = Object.keys(backup.escalas);
  if (chaves.length > 600) throw new Error("O backup excede o limite de meses.");
  const escalas = {};
  for (const ym of chaves) {
    if (!mesValido(ym) || !Array.isArray(backup.escalas[ym])) {
      throw new Error("Há uma escala inválida no backup.");
    }
    const [ano, mes] = ym.split("-").map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const linhas = backup.escalas[ym];
    if (linhas.length > 120) throw new Error(`A escala ${ym} excede o limite de linhas.`);
    escalas[ym] = linhas.map((linha) => {
      const dia = Number(linha?.d);
      const nomesEntrada = Array.isArray(linha?.nomes)
        ? linha.nomes
        : linha?.nome
          ? [linha.nome]
          : [];
      const nomes = nomesEntrada
        .map((nome) => String(nome || "").trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 8);
      const dataValida =
        Number.isInteger(dia) &&
        dia >= 1 &&
        dia <= diasNoMes &&
        Number(linha?.w) === new Date(ano, mes - 1, dia).getDay();
      if (
        !dataValida ||
        !horaValida(linha?.i) ||
        !horaValida(linha?.f) ||
        nomesEntrada.length > 8
      ) {
        throw new Error(`Há uma linha inválida na escala ${ym}.`);
      }
      return {
        d: dia,
        w: Number(linha.w),
        i: linha.i,
        f: linha.f,
        nomes,
        nome: nomes.join(" / "),
      };
    });
  }
  return { servos, escalas };
}

export default async (req) => {
  const senha = Netlify.env.get("SENHA_ADMIN");
  if (!senha) return json({ erro: "SENHA_ADMIN não configurada no Netlify." }, 500);
  if (req.headers.get("x-senha") !== senha) return json({ erro: "Senha inválida." }, 401);
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ erro: "Método não suportado." }, 405);
  }

  try {
    const escalaStore = getStore({ name: "escalas", consistency: "strong" });
    const servoStore = getStore({ name: "servos", consistency: "strong" });
    if (req.method === "GET") {
      const servos = (await servoStore.get("lista", { type: "json" })) || [];
      const { blobs } = await escalaStore.list();
      const escalas = {};
      for (const blob of blobs) {
        if (!mesValido(blob.key)) throw new Error("Há uma chave de escala inválida no armazenamento.");
        escalas[blob.key] = (await escalaStore.get(blob.key, { type: "json" })) || [];
      }
      return json({
        app: "escala-intercessao",
        schemaVersion: 1,
        criadoEm: new Date().toISOString(),
        servos,
        escalas,
      });
    }

    const corpo = await req.text();
    if (new TextEncoder().encode(corpo).byteLength > 5 * 1024 * 1024) {
      return json({ erro: "O arquivo excede o limite de 5 MB." }, 413);
    }
    const backup = validarBackup(JSON.parse(corpo));
    const { blobs } = await escalaStore.list();
    const chavesAtuais = blobs.map((blob) => blob.key);
    const servosAnteriores = (await servoStore.get("lista", { type: "json" })) || [];
    const escalasAnteriores = {};
    for (const key of chavesAtuais) {
      escalasAnteriores[key] = await escalaStore.get(key, { type: "json" });
    }

    try {
      await servoStore.setJSON("lista", backup.servos);
      for (const [key, linhas] of Object.entries(backup.escalas)) {
        await escalaStore.setJSON(key, linhas);
      }
      const novasChaves = new Set(Object.keys(backup.escalas));
      for (const key of chavesAtuais) {
        if (!novasChaves.has(key)) await escalaStore.delete(key);
      }
    } catch (erro) {
      await servoStore.setJSON("lista", servosAnteriores).catch(() => {});
      for (const key of chavesAtuais) {
        const valor = escalasAnteriores[key];
        if (valor == null) await escalaStore.delete(key).catch(() => {});
        else await escalaStore.setJSON(key, valor).catch(() => {});
      }
      for (const key of Object.keys(backup.escalas)) {
        if (!chavesAtuais.includes(key)) await escalaStore.delete(key).catch(() => {});
      }
      throw erro;
    }

    return json({
      ok: true,
      servos: backup.servos.length,
      meses: Object.keys(backup.escalas).length,
    });
  } catch (erro) {
    return json({ erro: erro.message || "Não foi possível processar o backup." }, 400);
  }
};
