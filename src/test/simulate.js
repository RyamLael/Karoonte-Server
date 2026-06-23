import "dotenv/config";
import mqtt from "mqtt";
import { TOPICS, topicRespostaDispositivo, topicResultadoDispositivo } from "../mqtt/topics.js";

const brokerLocal = process.env.MQTT_BROKER_LOCAL || "mqtt://localhost:1883";
const brokerOnline = process.env.MQTT_BROKER_ONLINE || "mqtt://broker.hivemq.com:1883";
const NUM_DISPOSITIVOS = Number(process.argv[2]) || 4;

let jogoJaComecou = false; 

function log(origem, msg) {
  console.log(`[${origem}] ${msg}`);
}

// Função para quebrar as URLs e criar a lista de fallback
const parseUrl = (urlString) => {
  const u = new URL(urlString);
  return { protocol: u.protocol.replace(':', ''), host: u.hostname, port: Number(u.port) || 1883 };
};

// Opções base de conexão com o Fallback
const mqttOptions = {
  servers: [parseUrl(brokerLocal), parseUrl(brokerOnline)],
  connectTimeout: 3000,
  reconnectPeriod: 2000,
};

function criarDispositivoFalso(idDispositivo) {
  const client = mqtt.connect({ 
    ...mqttOptions, 
    clientId: `sim-${idDispositivo}-${Math.random().toString(16).slice(2, 6)}` 
  });

  client.on("connect", () => {
    client.subscribe(TOPICS.STATUS_GLOBAL);
    client.subscribe(topicResultadoDispositivo(idDispositivo));
  });

  client.on("message", (topic, payloadBuffer) => {
    const payload = payloadBuffer.toString();

    if (topic === TOPICS.STATUS_GLOBAL && payload === "START") {
      const delayMs = 500 + Math.random() * 4500;
      const alternativas = ["A", "B", "C", "D"];
      const escolhida = alternativas[Math.floor(Math.random() * alternativas.length)];

      setTimeout(() => {
        client.publish(topicRespostaDispositivo(idDispositivo), escolhida, { qos: 1 });
        log(idDispositivo, `respondeu "${escolhida}" após ${Math.round(delayMs)}ms`);
      }, delayMs);
    }

    if (topic === topicResultadoDispositivo(idDispositivo)) {
      log(idDispositivo, `resultado recebido: ${payload}`);
    }
  });

  return client;
}

function criarOperadorWeb() {
  const client = mqtt.connect({ 
    ...mqttOptions, 
    clientId: `sim-operador-${Math.random().toString(16).slice(2, 6)}` 
  });

  client.on("connect", () => {
    log("SIMULADOR", `Conectado com sucesso ao broker: ${client.options.host}`);
    client.subscribe(TOPICS.PAINEL_WEB);
  });

  client.on("message", (topic, payloadBuffer) => {
    if (topic !== TOPICS.PAINEL_WEB) return;
    const payload = JSON.parse(payloadBuffer.toString());
    
    log("PAINEL", `Status da tela mudou para: ${payload.status}`);

    if (payload.status === "JOGO_FINALIZADO") {
      if (jogoJaComecou) {
        log("OPERADOR", "FIM DE JOGO! Pódio final recebido.");
        process.exit(0); 
      } else {
        log("OPERADOR", "Mensagem antiga ignorada.");
      }
    }
  });

  return client;
}

function iniciar() {
  log("SIMULADOR", `Procurando broker (Local primeiro, depois Online)...`);

  for (let i = 1; i <= NUM_DISPOSITIVOS; i++) {
    criarDispositivoFalso(`ESP32_${String(i).padStart(2, "0")}`);
  }

  const operador = criarOperadorWeb();

  setTimeout(() => {
    operador.publish(TOPICS.CONTROLE_WEB, JSON.stringify({ acao: "INICIAR_PARTIDA" }));
    jogoJaComecou = true;
    log("OPERADOR", "enviou INICIAR_PARTIDA");
  }, 3500); 
}

iniciar();