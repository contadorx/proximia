# Monitoramento — ligar a medição de disponibilidade

Os Termos prometem 99,5% em doze meses, com crédito de um mês em caso de
descumprimento. Sem medição, isso é afirmação. Este documento liga a medição.

## O que já existe no código

- `/api/saude` responde o estado de ambiente, banco e — com `?detalhado=1` — da
  rotina diária. Devolve **200** quando está tudo de pé e **503** quando não.
- `registrar_ping` grava o minuto medido (migration 0036).
- `disponibilidade_periodo` calcula os números (migrations 0036 e 0043).
- O painel de Negócio mostra o resultado dos últimos 30 dias.

Falta só apontar um monitor externo para a rota.

## Passo 1 — o segredo

Cadastre nas variáveis do projeto na Vercel:

```
MONITOR_SECRET=<algo longo e aleatório>
```

Refaça o deploy depois de cadastrar.

Sem o segredo, a rota continua respondendo normalmente e **não grava nada** —
que é o comportamento certo: qualquer pessoa poderia marcar minutos como fora do
ar e estragar justamente o número que você usaria numa discussão de contrato.

## Passo 2 — o monitor

Qualquer serviço de monitoração serve (UptimeRobot, Better Stack, Pingdom,
Checkly). Configure:

| Campo | Valor |
|---|---|
| URL | `https://SEU-ENDERECO/api/saude?ping=SEU_MONITOR_SECRET` |
| Método | GET |
| Intervalo | 1 minuto (5 minutos no plano gratuito da maioria) |
| Sucesso | HTTP 200 |
| Alerta | após 2 falhas seguidas |

Com intervalo de 5 minutos, a cobertura fica em torno de 20% dos minutos — e o
número defensável cai junto, porque minuto sem medição conta como fora. Para
sustentar os 99,5% é preciso medir de minuto em minuto.

### Um segundo monitor, para a rotina diária

Uma checagem por dia, de manhã, em:

```
https://SEU-ENDERECO/api/saude?detalhado=1
```

Ela devolve 503 quando a rotina diária não roda há mais de 26 horas. É o alarme
do caso mais silencioso que existe: nada falhou porque nada rodou.

## Passo 3 — conferir

No painel de Negócio, o bloco **Operação** deve sair de "sem medição" em alguns
minutos. Os dois números aparecem juntos, de propósito:

- **defensável** — minuto sem medição conta como fora do ar. É o que se sustenta
  diante de um cliente cobrando o crédito.
- **sobre o que respondeu** — só os minutos medidos. Responde outra pergunta:
  quando respondeu, respondeu bem?

Nos primeiros dias o defensável fica baixo — a janela de 30 dias inclui o
período em que ninguém media. Isso é correto e some sozinho conforme a medição
acumula.

## Por que o monitor é externo

Um monitor rodando dentro da aplicação não registra a própria queda: se ela
estiver fora, ninguém grava nada, e a ausência viraria "100% de disponibilidade"
com cobertura baixa. Foi exatamente esse furo que a migration 0043 corrigiu, ao
passar a contar minuto sem medição como fora do ar.

## Enquanto não houver monitor

O número honesto a dizer é "não medimos ainda", não 99,5%. Se um contrato for
assinado antes de a medição estar de pé, vale datar a cláusula: prometer a partir
de uma data declarada, em vez de prometer retroativo sobre o que ninguém mediu.
