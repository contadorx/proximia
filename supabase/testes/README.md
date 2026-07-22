# Testes de banco

Os testes de unidade (`npm run teste`) cobrem as funções puras: formatação,
cálculo de saldo, taxa de conversão, agregações e escape de CSV.

O que **não** dá para cobrir ali são as regras que vivem no banco — políticas de
acesso, gatilhos, colunas geradas e as travas de integridade. Elas são a parte
mais importante do produto: a tela pode estar errada que o banco recusa.

## Como rodar

Precisa de um Postgres 16 com as extensões `pgcrypto` e os esquemas `auth` e
`storage` simulados (no Supabase eles já existem).

```bash
# 1. banco limpo
createdb proximia_teste

# 2. as migrations, na ordem
for f in supabase/migrations/0*.sql; do psql -d proximia_teste -f "$f"; done

# 3. os testes
for f in supabase/testes/*.sql; do psql -d proximia_teste -f "$f"; done
```

Cada arquivo é um bloco `do $$ ... $$` que levanta exceção na primeira regra
violada e termina com uma linha de sucesso. Falhou, o `psql` sai com erro.

## O que cada arquivo cobre

| Arquivo | Verifica |
|---|---|
| `acesso.sql` | Alcance por papel, travas de dono e de auto-alteração |
| `capturas.sql` | Captura como evento, estorno, imutabilidade do lançamento |
| `pipeline.sql` | Prazo por etapa, alerta de parada, taxa sobre o que encerrou |
| `playbooks.sql` | Cadência, não duplicação e recriação após conclusão |
| `resumo.sql` | Seleção de quem recebe o resumo e preferências |

> Estes arquivos foram escritos e executados durante o desenvolvimento. Rodá-los
> em integração contínua exige subir um Postgres no fluxo — próximo passo natural
> desta suíte.
