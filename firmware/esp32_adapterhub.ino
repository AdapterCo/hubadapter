/*
  =============================================================================
  AdapterHub — Código do Firmware ESP32 (Com protocolo ACK de confirmação ponta a ponta)
  =============================================================================
  Descrição:
    Este firmware conecta o ESP32 ao Wi-Fi, reporta o heartbeat para o servidor
    hub.adapterco.com.br e conecta ao MQTT para receber liberação de créditos.
    Ele escuta no tópico configurado como o seu IDMAQ (ex: ADP-001).
    Ao receber um comando de crédito, ele responde IMEDIATAMENTE com um ACK HTTP
    ao servidor para confirmação de entrega ponta a ponta antes de liberar o relé.

  Bibliotecas necessárias (Instalar no Arduino IDE / PlatformIO):
    - PubSubClient (por Nick O'Leary)
    - ArduinoJson (por Benoit Blanchon - versão 6.x ou 7.x)

  Hardware:
    - ESP32 Dev Module
    - Módulo Relé 5V/3.3V (Conectado ao pino GPIO 26 ou GPIO 2)
    - LED Status (opcional, usa LED_BUILTIN GPIO 2)
  =============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// =============================================================================
// CONFIGURAÇÕES DO DISPOSITIVO & REDE
// =============================================================================
// Código IDMAQ impresso no dispositivo (ex: ADP-001, ADP-002...)
const char* IDMAQ = "ADP-001";

// Credenciais da rede Wi-Fi
const char* WIFI_SSID     = "SUA_REDE_WIFI";
const char* WIFI_PASSWORD = "SUA_SENHA_WIFI";

// Servidor Web & Webhook do AdapterHub
const char* HUB_SERVER_URL = "https://hub.adapterco.com.br";

// Servidor MQTT da AdapterCo
const char* MQTT_SERVER   = "apimqtt.adapterco.com.br";
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = ""; // Deixe vazio se não houver autenticação
const char* MQTT_PASS     = "";

// Pino do Relé / Pulso para o mecanismo da máquina
const int RELAY_PIN       = 26; // GPIO para acionamento do relé
const int LED_STATUS_PIN  = 2;  // LED embutido para indicação visual

// Configuração do pulso (Tempo que o relé fica ativado por pulso em milissegundos)
const int PULSE_DURATION_MS = 500;  // 0.5s ativado por pulso
const int PULSE_INTERVAL_MS = 300;  // 0.3s intervalo entre pulsos

// Modo de acionamento:
// true  = Um pulso por cada R$ 1,00 creditado (ex: R$ 5,00 = 5 pulsos)
// false = Pulso único contínuo independente do valor
const bool PULSE_PER_BRL    = true;

// =============================================================================
// VARIÁVEIS GLOBAIS DE ESTADO & ARMAZENAMENTO IDEMPOTENTE
// =============================================================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Preferences preferences;

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // Envia heartbeat a cada 30 segundos

bool wasProcessed(const String& paymentId) {
  preferences.begin("adapterhub", true);
  String processed = preferences.getString("processed", "");
  preferences.end();
  return processed.indexOf(paymentId) != -1;
}

void markProcessed(const String& paymentId) {
  preferences.begin("adapterhub", false);
  String processed = preferences.getString("processed", "");
  if (processed.length() > 2000) {
    processed = processed.substring(processed.length() - 1000);
  }
  if (processed.indexOf(paymentId) == -1) {
    if (processed.length() > 0) processed += ",";
    processed += paymentId;
  }
  preferences.putString("processed", processed);
  preferences.end();
}

// =============================================================================
// FUNÇÃO DE ENVIO DE HEARTBEAT E ACK PONTA A PONTA PARA O PAINEL WEB (HTTPS)
// =============================================================================
void sendServerHeartbeat(const String& paymentId = "") {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(HUB_SERVER_URL) + "/api/heartbeat";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["idmaq"] = IDMAQ;
    if (paymentId.length() > 0) {
      doc["paymentId"] = paymentId;
      doc["ack"] = true;
    }

    String jsonBody;
    serializeJson(doc, jsonBody);

    int httpCode = http.POST(jsonBody);
    if (httpCode > 0) {
      Serial.print("💚 Heartbeat/ACK enviado ao servidor. HTTP Code: ");
      Serial.println(httpCode);
    } else {
      Serial.print("⚠️ Erro ao enviar Heartbeat/ACK ao servidor: ");
      Serial.println(http.errorToString(httpCode));
    }
    http.end();
  }
}

// =============================================================================
// FUNÇÃO DE LIBERAÇÃO DE CRÉDITO (RELÉ)
// =============================================================================
void triggerCredit(float amount) {
  Serial.println("==========================================");
  Serial.print("💳 LIBERANDO CRÉDITO! Valor: R$ ");
  Serial.println(amount);
  Serial.println("==========================================");

  int pulses = 1;
  if (PULSE_PER_BRL && amount >= 1.0) {
    pulses = (int)amount; // 1 pulso por R$ 1,00 inteiros
  }

  for (int i = 0; i < pulses; i++) {
    Serial.print("⚡ Executando pulso ");
    Serial.print(i + 1);
    Serial.print(" de ");
    Serial.println(pulses);

    digitalWrite(RELAY_PIN, HIGH);
    digitalWrite(LED_STATUS_PIN, HIGH);
    delay(PULSE_DURATION_MS);

    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(LED_STATUS_PIN, LOW);
    delay(PULSE_INTERVAL_MS);
  }

  Serial.println("✅ Crédito liberado com sucesso!");
}

// =============================================================================
// CALLBACK MQTT (Processa mensagens recebidas com confirmação ACK)
// =============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("📩 Mensagem recebida no tópico [");
  Serial.print(topic);
  Serial.println("]:");

  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.print("❌ Erro ao decodificar JSON: ");
    Serial.println(error.c_str());
    return;
  }

  const char* action = doc["action"];
  float amount = doc["amount"] | 0.0;
  const char* paymentIdValue = doc["paymentId"];

  if (!action) {
    Serial.println("Comando rejeitado: action ausente.");
    return;
  }

  // Se for comando de ping, responde imediatamente com heartbeat HTTP e pisca LED
  if (strcmp(action, "ping") == 0) {
    Serial.println("📡 Ping recebido do servidor! Confirmando presença...");
    sendServerHeartbeat(paymentIdValue ? String(paymentIdValue) : "ping-ack");
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_STATUS_PIN, HIGH);
      delay(100);
      digitalWrite(LED_STATUS_PIN, LOW);
      delay(100);
    }
    return;
  }

  // Para créditos (reais ou teste), exige o paymentId para garantia de idempotência
  if (!paymentIdValue) {
    Serial.println("Comando rejeitado: paymentId ausente para instrução de crédito.");
    return;
  }

  String paymentId(paymentIdValue);
  if (wasProcessed(paymentId)) {
    Serial.println("Comando ignorado: paymentId já processado anteriormente.");
    // Envia o ACK mesmo se já processado para destravar o servidor em caso de reenvio
    sendServerHeartbeat(paymentId);
    return;
  }

  if (strcmp(action, "credit") == 0 || strcmp(action, "credit_test") == 0) {
    // 1. DISPARA O ACK PONTA A PONTA IMEDIATAMENTE PARA CONFIRMAR AO SERVIDOR QUE O ESP32 RECEBEU!
    sendServerHeartbeat(paymentId);
    
    // 2. Marca como processado para garantir idempotência
    markProcessed(paymentId);

    // 3. Aciona os pulsos do relé
    triggerCredit(amount > 0 ? amount : 1.0);
  }
}

// =============================================================================
// CONEXÃO WI-FI
// =============================================================================
void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("🌐 Conectando à rede Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_STATUS_PIN, !digitalRead(LED_STATUS_PIN));
    attempts++;
    if (attempts > 40) {
      Serial.println("\n⚠️ Falha ao conectar no Wi-Fi. Reiniciando...");
      ESP.restart();
    }
  }

  digitalWrite(LED_STATUS_PIN, LOW);
  Serial.println("");
  Serial.println("✅ Wi-Fi Conectado!");
  Serial.print("📍 Endereço IP: ");
  Serial.println(WiFi.localIP());

  // Envia heartbeat assim que conectar
  sendServerHeartbeat();
}

// =============================================================================
// CONEXÃO MQTT
// =============================================================================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("📡 Conectando ao Broker MQTT...");
    String clientId = "ESP32_AdapterHub_" + String(IDMAQ) + "_" + String(random(0xffff), HEX);

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" Conectado!");
      mqttClient.subscribe(IDMAQ);
      Serial.print("📥 Inscrito no tópico MQTT: ");
      Serial.println(IDMAQ);

      StaticJsonDocument<200> doc;
      doc["idmaq"] = IDMAQ;
      doc["status"] = "online";
      doc["ip"] = WiFi.localIP().toString();

      char buffer[200];
      serializeJson(doc, buffer);
      
      String statusTopic = String(IDMAQ) + "/status";
      mqttClient.publish(statusTopic.c_str(), buffer);

    } else {
      Serial.print(" ❌ Falha (código rc=");
      Serial.print(mqttClient.state());
      Serial.println("). Tentando novamente em 5 segundos...");
      delay(5000);
    }
  }
}

// =============================================================================
// SETUP INICIAL
// =============================================================================
void setup() {
  Serial.begin(115200);
  
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_STATUS_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(LED_STATUS_PIN, LOW);

  Serial.println("\n------------------------------------------");
  Serial.println("🚀 AdapterHub ESP32 Firmware Inicializando");
  Serial.print("🏷️ IDMAQ: ");
  Serial.println(IDMAQ);
  Serial.println("------------------------------------------");

  setupWiFi();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

// =============================================================================
// LOOP PRINCIPAL
// =============================================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }

  if (!mqttClient.connected()) {
    reconnectMQTT();
  }

  mqttClient.loop();

  // Envia Heartbeat periódico para o servidor web e MQTT
  unsigned long now = millis();
  if (now - lastHeartbeatTime > HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = now;

    sendServerHeartbeat();

    StaticJsonDocument<128> hbDoc;
    hbDoc["idmaq"] = IDMAQ;
    hbDoc["status"] = "online";
    hbDoc["uptime"] = millis() / 1000;

    char buffer[128];
    serializeJson(hbDoc, buffer);
    
    String statusTopic = String(IDMAQ) + "/status";
    mqttClient.publish(statusTopic.c_str(), buffer);
  }
}
