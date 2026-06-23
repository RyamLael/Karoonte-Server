import mqtt from "mqtt";
import {
  TOPICS,
  topicResultadoDispositivo,
  extrairIdDispositivo,
} from "./topics.js";
import { GameState } from "../core/gameState.js";

/**
 * Esta classe traduz:
 * mensagens MQTT recebidas  -> chamadas no GameState
 * eventos do GameState      -> mensagens MQTT publicadas
 */
export class KahootMqttServer {
  constructor({ brokerLocal, brokerOnline, perguntas, mqttOptions = {} }) {
    
    // Função auxiliar para converter a URL string
    const parseUrl = (urlString) => {
      const u = new URL(urlString);
      return { 
        protocol: u.protocol.replace(':', ''), 
        host: u.hostname, 
        port: Number(u.port) || 1883 
      };
    };

    // MÁGICA DO FALLBACK
    this.client = mqtt.connect({
      servers: [parseUrl(brokerLocal), parseUrl(brokerOnline)],
      connectTimeout: 3000, 
      reconnectPeriod: 2000,
      ...mqttOptions,
    });

    // Conectando os novos callbacks automáticos do GameState
    this.gameState = new GameState(perguntas, {
      onTick: (payload) => this._publicarAtualizacao(payload),
      onFimRodada: (evento) => this._publicarFimRodada(evento, false),
      onFimDeJogo: (evento) => this._publicarFimRodada(evento, true),
      onProximaPerguntaAutomatica: (resultado) => {
        this._publicarComandoStatus("START");
        this._publicarPergunta(resultado.pergunta);
      }
    });

    this._registrarHandlers();
  }

  _registrarHandlers() {
    this.client.on("connect", () => {
      console.log(`[MQTT] Conectado com sucesso ao Broker ativo: ${this.client.options.host}`);
      this.client.subscribe(TOPICS.CONTROLE_WEB, { qos: 1 });
      this.client.subscribe(TOPICS.RESPOSTA_DISPOSITIVO_WILDCARD, { qos: 1 });
      console.log(`[MQTT] Inscrito em: ${TOPICS.CONTROLE_WEB}`);
      console.log(`[MQTT] Inscrito em: ${TOPICS.RESPOSTA_DISPOSITIVO_WILDCARD}`);
    });

    this.client.on("reconnect", () => console.log("[MQTT] Tentando reconectar..."));
    this.client.on("error", (err) => console.error("[MQTT] Erro:", err.message));
    this.client.on("close", () => console.warn("[MQTT] Conexão encerrada."));

    this.client.on("message", (topic, payloadBuffer) => {
      this._roteaMensagem(topic, payloadBuffer);
    });
  }

  _roteaMensagem(topic, payloadBuffer) {
    const payloadStr = payloadBuffer.toString();

    try {
      if (topic === TOPICS.CONTROLE_WEB) {
        this._tratarComandoWeb(payloadStr);
        return;
      }

      // Rota ajustada para: karoonte/{id}/answer
      if (topic.startsWith("karoonte/") && topic.endsWith("/answer")) {
        this._tratarRespostaDispositivo(topic, payloadStr);
        return;
      }
    } catch (err) {
      console.error(`[MQTT] Falha ao processar mensagem em "${topic}":`, err.message);
    }
  }

  // ---------------------------------------------------------------
  // RF04 - Comando de Início de Pergunta (vindo da interface web)
  // ---------------------------------------------------------------
  _tratarComandoWeb(payloadStr) {
    let message;
    try {
      message = JSON.parse(payloadStr);
    } catch {
      console.warn("[Web] Payload de controle inválido (não é JSON):", payloadStr);
      return;
    }

    const { acao } = message;
    console.log(`[Web] Comando recebido: ${acao}`);

    if (acao === "INICIAR_PARTIDA") {
      const resultado = this.gameState.iniciarPartida();
      this._publicarComandoStatus("START");
      this._publicarPergunta(resultado.pergunta);
    }
  }

  // ---------------------------------------------------------------
  // RF05 - Recebimento de respostas do ESP32
  // ---------------------------------------------------------------
  _tratarRespostaDispositivo(topic, payloadStr) {
    const idDispositivo = extrairIdDispositivo(topic);
    if (!idDispositivo) return;

    const alternativa = payloadStr.trim();

    if (!["A", "B", "C", "D"].includes(alternativa)) {
      console.warn(`[ESP32:${idDispositivo}] Alternativa inválida: ${alternativa}`);
      return;
    }

    const resultado = this.gameState.registrarResposta(idDispositivo, alternativa);

    if (resultado.aceita) {
      console.log(
        `[ESP32:${idDispositivo}] Respondeu "${alternativa}" ` +
          `(${resultado.totalVotos}/${resultado.totalConectados})`
      );
    } else {
      console.log(`[ESP32:${idDispositivo}] Resposta ignorada (${resultado.motivo})`);
    }
  }

  // ---------------------------------------------------------------
  // Publishers: servidor -> ESP32 e Web
  // ---------------------------------------------------------------
  _publicarComandoStatus(payload) {
    this.client.publish(TOPICS.STATUS_GLOBAL, payload, { qos: 1 });
    console.log(`[MQTT] -> ${TOPICS.STATUS_GLOBAL}: ${payload}`);
  }

  _publicarFeedbackIndividual(resultadosIndividuais) {
    for (const { idDispositivo, correta } of resultadosIndividuais) {
      const topic = topicResultadoDispositivo(idDispositivo);
      const payload = correta ? "CORRECT" : "INCORRECT";
      this.client.publish(topic, payload, { qos: 1 });
    }
  }

  _publicarPergunta(pergunta) {
    const payload = {
      status: "RODADA_INICIADA",
      pergunta: {
        id: pergunta.id_pergunta,
        text: pergunta.enunciado,
        options: [
          pergunta.alternativas.A, 
          pergunta.alternativas.B, 
          pergunta.alternativas.C, 
          pergunta.alternativas.D
        ],
        correctAnswerIndex: ["A", "B", "C", "D"].indexOf(pergunta.resposta_correta)
      },
      tempo: pergunta.tempo_limite_segundos,
    };
    this._publicarPainel(payload);
  }

  _publicarAtualizacao({ tempoRestanteSegundos, totalVotos }) {
    this._publicarPainel({
      status: "ATUALIZACAO",
      tempo_restante: tempoRestanteSegundos,
      total_votos: totalVotos,
    });
  }

  _publicarFimRodada(evento, ehFimDeJogo) {
    if (evento.porTimeout) {
      this._publicarComandoStatus("TIMEOUT");
    }

    this._publicarFeedbackIndividual(evento.resultadosIndividuais);

    if (ehFimDeJogo) {
      this._publicarPainel({
        status: "JOGO_FINALIZADO", 
        ranking: evento.ranking,
      });
    } else {
      this._publicarPainel({
        status: "RODADA_ENCERRADA", 
        estatisticas: evento.estatisticas,
        ranking: evento.ranking,
        gabarito: evento.gabarito,
      });
    }
  }

  _publicarPainel(payloadObj) {
    this.client.publish(TOPICS.PAINEL_WEB, JSON.stringify(payloadObj), { qos: 1 });
    console.log(`[MQTT] -> ${TOPICS.PAINEL_WEB}:`, payloadObj.status);
  }

  fechar() {
    this.client.end();
  }
}