#pragma once

// Copie para secrets.h. O arquivo secrets.h é ignorado pelo Git.
#define IDMAQ "ADP-001"
#define DEVICE_API_KEY "CHAVE_UNICA_GERADA_NO_CADASTRO_DO_DISPOSITIVO"

// Certificado raiz PEM usado pelo heartbeat HTTPS.
static const char ROOT_CA_CERT[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
SUBSTITUA_PELO_CERTIFICADO_RAIZ_DOS_SERVIDORES
-----END CERTIFICATE-----
)EOF";
