import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { KahootMqttServer } from "./mqtt/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------
// RF01 - Carga de Questionário
// ---------------------------------------------------------------
function carregarPerguntas() {
  const caminho = join(__dirname, "data", "questions.json");
  const conteudo = readFileSync(caminho, "utf-8");
  const perguntas = JSON.parse(conteudo);

  if (!Array.isArray(perguntas) || perguntas.length === 0) {
    throw new Error("Arquivo de perguntas está vazio ou em formato inválido.");
  }

  console.log(`[Servidor] ${perguntas.length} perguntas carregadas de questions.json`);
  return perguntas;
}

function main() {
  const brokerLocal = process.env.MQTT_BROKER_LOCAL || "mqtt://localhost:1883";
  const brokerOnline = process.env.MQTT_BROKER_ONLINE || "mqtt://broker.hivemq.com:1883";
  
  const perguntas = carregarPerguntas();

  const servidor = new KahootMqttServer({
    brokerLocal,
    brokerOnline,
    perguntas,
    mqttOptions: {
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      clientId: `kahoot-servidor-${Math.random().toString(16).slice(2, 8)}`,
    },
  });

  console.log("[Servidor] Aguardando conexões e comandos...");

  process.on("SIGINT", () => {
    console.log("\n[Servidor] Encerrando conexão MQTT...");
    servidor.fechar();
    process.exit(0);
  });
}

main();
