# AdapterHub

Painel Next.js para cadastro e monitoramento de dispositivos ESP32, validação de
pagamentos Mercado Pago e entrega idempotente de créditos por MQTT.

## Requisitos

- Node.js 20.9 ou superior
- PostgreSQL 16
- Docker e Docker Compose para produção
- Broker MQTT com TLS, autenticação e ACL por dispositivo

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha todos os segredos com valores exclusivos.
3. Instale as dependências com `npm install`.
4. Execute `npx prisma migrate dev`.
5. Execute `npm run db:seed` para criar o administrador.
6. Inicie com `npm run dev`.

Nunca versionar `.env`, `firmware/secrets.h`, tokens Mercado Pago, credenciais
MQTT ou senhas Wi-Fi.

## Variáveis obrigatórias

- `DATABASE_URL`: conexão PostgreSQL.
- `NEXTAUTH_SECRET`: segredo aleatório de sessão.
- `NEXTAUTH_URL`: URL pública da aplicação.
- `APP_ENCRYPTION_KEY`: 32 bytes em hexadecimal ou base64 para AES-256-GCM.
- `ADMIN_EMAIL` e `ADMIN_PASSWORD`: provisionamento explícito do administrador.
- `OUTBOX_WORKER_SECRET`: autenticação do processador de comandos pendentes.
- `MQTT_API_URL` e `MQTT_API_TOKEN`: publicação autenticada no gateway MQTT.

Cada cliente também deve configurar no painel seu Access Token e a assinatura
secreta do webhook do Mercado Pago.

## Arquitetura

- Next.js App Router e NextAuth com sessões JWT.
- Prisma/PostgreSQL com migrações versionadas.
- Webhook Mercado Pago validado por `x-signature` e pela API oficial.
- Transação atômica para pagamento, saldo, telemetria e outbox.
- Worker persistente com backoff para entrega MQTT.
- Heartbeat autenticado por chave exclusiva do dispositivo.
- MQTT TLS, credenciais por dispositivo, assinatura HMAC e deduplicação de
  `paymentId` no firmware.

## Firmware

Copie `firmware/secrets.example.h` para `firmware/secrets.h` e preencha:

- IDMAQ;
- Wi-Fi;
- chave única exibida no provisionamento do dispositivo;
- usuário e senha MQTT exclusivos;
- certificado raiz dos servidores HTTPS/MQTT.

O arquivo real de segredos é ignorado pelo Git.

## Banco e deploy

Produção usa somente:

```bash
npx prisma migrate deploy
```

O Compose executa migrações, criptografa dados legados, cria o administrador,
processa a outbox e limpa telemetria operacional antiga. O deploy falha se um
segredo obrigatório estiver ausente.

Para subir:

```bash
cp infra/.env.production.example .env
# preencha os valores
bash infra/deploy.sh
```

## Verificações

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Eventos de pagamento não são removidos pela rotina de retenção. A retenção da
telemetria operacional é controlada por `TELEMETRY_RETENTION_DAYS`.

## Rotação de credenciais expostas

Credenciais já publicadas devem ser revogadas nos serviços de origem. Apenas
remover o texto do código não invalida Wi-Fi, conta administrativa ou tokens
presentes no histórico Git.
