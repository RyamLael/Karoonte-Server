/**
 * Tópicos MQTT - única fonte de verdade para toda a arquitetura de mensageria.
 * Adaptado para os tópicos definidos no front-end/ESP32 da equipe.
 */

export const TOPICS = {
  // ---- INBOUND: mensagens que o servidor ESCUTA ----
  CONTROLE_WEB: "karoonte/servidor/controle_web",
  RESPOSTA_DISPOSITIVO_WILDCARD: "karoonte/+/answer",

  // ---- OUTBOUND: mensagens que o servidor PUBLICA ----
  STATUS_GLOBAL: "karoonte/status",
  PAINEL_WEB: "karoonte/web/painel",
};

/**
 * Monta o tópico de resposta individual de um dispositivo.
 */
export function topicRespostaDispositivo(idDispositivo) {
  return `karoonte/${idDispositivo}/answer`;
}

/**
 * Monta o tópico de resultado individual de um dispositivo.
 */
export function topicResultadoDispositivo(idDispositivo) {
  return `karoonte/${idDispositivo}/result`;
}

/**
 * Extrai o id_dispositivo de um tópico de resposta recebido.
 * Ex: "karoonte/ESP32_01/answer" -> "ESP32_01"
 */
export function extrairIdDispositivo(topic) {
  const partes = topic.split("/");
  // karoonte(0) / {id}(1) / answer(2)
  return partes.length === 3 ? partes[1] : null;
}