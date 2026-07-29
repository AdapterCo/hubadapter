#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// =============================================================================
// CONFIGURAÇÕES DO DISPOSITIVO & REDE
// =============================================================================
// Código do dispositivo. Altere este valor para cada ESP32.
const char* IDMAQ = "ADP-002";

// Servidor Web & Webhook do AdapterHub
const char* HUB_SERVER_URL = "https://hub.adapterco.com.br";

// Servidor MQTT da AdapterCo
const char* MQTT_SERVER   = "apimqtt.adapterco.com.br";
const int   MQTT_PORT     = 1883;

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
// VARIÁVEIS GLOBAIS DE ESTADO
// =============================================================================
WiFiClient mqttNetworkClient;
WiFiClientSecure httpsClient;
PubSubClient mqttClient(mqttNetworkClient);
Preferences preferences;

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // Envia heartbeat a cada 30 segundos

// =============================================================================
// FUN��O DE ENVIO DE HEARTBEAT PARA O PAINEL WEB (HTTPS)
// =============================================================================
void sendServerHeartbeat() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(HUB_SERVER_URL) + "/api/heartbeat";
    httpsClient.setInsecure();
    http.begin(httpsClient, url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<128> doc;
    doc["idmaq"] = IDMAQ;

    String jsonBody;
    serializeJson(doc, jsonBody);

    int httpCode = http.POST(jsonBody);
    if (httpCode > 0) {
      Serial.print("💚 Heartbeat enviado ao servidor. HTTP Code: ");
      Serial.println(httpCode);
    } else {
      Serial.print("⚠️ Erro ao enviar Heartbeat ao servidor: ");
      Serial.println(http.errorToString(httpCode));
    }
    http.end();
  }
}

// =============================================================================
// FUN��O DE LIBERA��O DE CR�DITO (REL�)
// =============================================================================
void triggerCredit(float amount) {
  Serial.println("==========================================");
  Serial.print("💳 LIBERANDO CRÉDITO! Valor: R$ ");
  Serial.println(amount);
  Serial.println("==========================================");

  int pulses = 1;
  if (PULSE_PER_BRL && amount >= 1.0) {
    pulses = (int)amount; // 1 pulso por R$ 1,00
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

bool wasProcessed(const String& paymentId) {
  String processed = preferences.getString("processed", "");
  return ("|" + processed + "|").indexOf("|" + paymentId + "|") >= 0;
}

void markProcessed(const String& paymentId) {
  String processed = preferences.getString("processed", "");
  processed += (processed.length() ? "|" : "") + paymentId;

  while (processed.length() > 768) {
    int separator = processed.indexOf('|');
    if (separator < 0) break;
    processed = processed.substring(separator + 1);
  }
  preferences.putString("processed", processed);
}

// =============================================================================
// CALLBACK MQTT (Processa mensagens recebidas)
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

  if (!action || !paymentIdValue) {
    Serial.println("Comando rejeitado: action ou paymentId ausente.");
    return;
  }

  String paymentId(paymentIdValue);
  if (wasProcessed(paymentId)) {
    Serial.println("Comando ignorado: paymentId já processado.");
    return;
  }

  if (action && (strcmp(action, "credit") == 0 || strcmp(action, "credit_test") == 0)) {
    triggerCredit(amount > 0 ? amount : 1.0);
    markProcessed(paymentId);
  } else if (action && strcmp(action, "ping") == 0) {
    Serial.println("📡 Ping recebido do servidor!");
    sendServerHeartbeat();
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_STATUS_PIN, HIGH);
      delay(100);
      digitalWrite(LED_STATUS_PIN, LOW);
      delay(100);
    }
  }
}

// =============================================================================
// CONEX�O WI-FI
// =============================================================================
void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.println("🌐 Iniciando WiFiManager...");

  WiFiManager wifiManager;
  wifiManager.setConfigPortalTimeout(180);
  String portalName = String("AdapterHub-") + IDMAQ;

  digitalWrite(LED_STATUS_PIN, HIGH);
  if (!wifiManager.autoConnect(portalName.c_str())) {
    Serial.println("⚠️ Falha ao configurar o Wi-Fi. Reiniciando...");
    delay(2000);
    ESP.restart();
    return;
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
// CONEX�O MQTT
// =============================================================================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("📡 Conectando ao Broker MQTT...");
    String clientId = "ESP32_AdapterHub_" + String(IDMAQ) + "_" + String(random(0xffff), HEX);

    bool connected = mqttClient.connect(clientId.c_str());

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
  preferences.begin("adapterhub", false);

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
