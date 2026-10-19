# Escala do Ministério de Intercessão (Netlify)

- `/` → página PÚBLICA: qualquer pessoa escolhe mês/ano, vê a escala e baixa o PDF (sem telefones).
- `/admin.html` → painel com SENHA: monta e publica a escala (só seleciona servos) e gerencia servos
  (cadastrar, editar, inativar, excluir). Os telefones só são acessíveis com a senha.
- Banco de dados: Netlify Blobs (já incluso, sem serviço extra).

## Publicar
1. Suba a pasta em um repositório (GitHub) e importe no Netlify (ou `netlify deploy --prod` pela CLI).
   Arrastar e soltar a pasta NÃO funciona (as funções não rodam).
2. Em Site configuration > Environment variables, crie **SENHA_ADMIN** com a senha do painel.
3. Faça um novo deploy e acesse /admin.html.
