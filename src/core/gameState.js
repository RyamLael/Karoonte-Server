import { calcularPontuacao } from "./scoring.js";

/**
 * Estados possíveis da partida.
 * Simplificado para 3 estados, já que a tela de Estatísticas
 * e Ranking foram fundidas na implementação do front-end.
 */
export const ESTADOS = {
  LOBBY: "LOBBY",
  PERGUNTA_ATIVA: "PERGUNTA_ATIVA",
  FIM_RODADA: "FIM_RODADA"
};

export class GameState {
  constructor(perguntas, callbacks) {
    this.perguntas = perguntas;
    /* Callbacks atualizados para refletir o fluxo automático:
       { onTick, onFimRodada, onFimDeJogo, onProximaPerguntaAutomatica } 
    */
    this.callbacks = callbacks; 

    this._resetTudo();
  }

  _resetTudo() {
    this.estado = ESTADOS.LOBBY;
    this.indicePerguntaAtual = -1;
    this.dispositivosConectados = new Map();
    this.pontuacoes = new Map();
    this.respostasRodadaAtual = new Map();
    this.timestampInicioPergunta = null;
    this.timeoutHandle = null;
    this.tickIntervalHandle = null;
    this.intervaloTransicaoHandle = null; // Novo timer para o intervalo de 5s
  }

  // ---------------------------------------------------------------
  // RF03 - Cadastro Automático de Dispositivos (Sem Login)
  // ---------------------------------------------------------------
  registrarDispositivo(idDispositivo) {
    if (!this.dispositivosConectados.has(idDispositivo)) {
      this.dispositivosConectados.set(idDispositivo, { ultimoPing: Date.now() });
      this.pontuacoes.set(idDispositivo, 0);
      return true;
    }
    this.dispositivosConectados.get(idDispositivo).ultimoPing = Date.now();
    return false;
  }

  listarDispositivos() {
    return Array.from(this.dispositivosConectados.keys());
  }

  // ---------------------------------------------------------------
  // RF02 - Gerenciamento de Partida Única
  // ---------------------------------------------------------------
  iniciarPartida() {
    if (this.estado !== ESTADOS.LOBBY) {
      this._resetTudo();
    }
    this.indicePerguntaAtual = -1;
    return this._avancarParaProximaPergunta();
  }

  _avancarParaProximaPergunta() {
    this.indicePerguntaAtual += 1;
    this.estado = ESTADOS.PERGUNTA_ATIVA;
    this.respostasRodadaAtual = new Map();
    this.timestampInicioPergunta = Date.now();

    const pergunta = this.perguntaAtual();
    this._agendarTimeout(pergunta.tempo_limite_segundos * 1000);

    return { fimDeJogo: false, pergunta };
  }

  perguntaAtual() {
    return this.perguntas[this.indicePerguntaAtual];
  }

  // ---------------------------------------------------------------
  // RF07 - Encerramento por Tempo (Timeout)
  // ---------------------------------------------------------------
  _agendarTimeout(duracaoMs) {
    this._limparTimers();

    this.timeoutHandle = setTimeout(() => {
      this._encerrarRodada({ porTimeout: true });
    }, duracaoMs);

    const inicioTick = Date.now();
    this.tickIntervalHandle = setInterval(() => {
      const decorridoMs = Date.now() - inicioTick;
      const restanteMs = Math.max(duracaoMs - decorridoMs, 0);
      this.callbacks.onTick?.({
        tempoRestanteSegundos: Math.ceil(restanteMs / 1000),
        totalVotos: this.respostasRodadaAtual.size,
      });
    }, 1000);
  }

  _limparTimers() {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    if (this.tickIntervalHandle) clearInterval(this.tickIntervalHandle);
    if (this.intervaloTransicaoHandle) clearTimeout(this.intervaloTransicaoHandle);
    this.timeoutHandle = null;
    this.tickIntervalHandle = null;
    this.intervaloTransicaoHandle = null;
  }

  // ---------------------------------------------------------------
  // RF05 - Recebimento e Registro de Respostas
  // ---------------------------------------------------------------
  registrarResposta(idDispositivo, alternativa) {
    if (this.estado !== ESTADOS.PERGUNTA_ATIVA) {
      return { aceita: false, motivo: "RODADA_NAO_ATIVA" };
    }

    this.registrarDispositivo(idDispositivo);

    if (this.respostasRodadaAtual.has(idDispositivo)) {
      return { aceita: false, motivo: "DUPLICATA" };
    }

    const timestampMs = Date.now();
    this.respostasRodadaAtual.set(idDispositivo, { alternativa, timestampMs });

    const totalConectados = this.dispositivosConectados.size;
    const totalRespostas = this.respostasRodadaAtual.size;

    // Diferente do seu amigo que travou em 2 jogadores, aqui continua dinâmico!
    if (totalConectados > 0 && totalRespostas >= totalConectados) {
      this._encerrarRodada({ porTimeout: false });
    }

    return {
      aceita: true,
      totalVotos: totalRespostas,
      totalConectados,
    };
  }

  // ---------------------------------------------------------------
  // RF07/RF08 -> RF09/RF10/RF11 - Encerramento e Progressão Automática
  // ---------------------------------------------------------------
  _encerrarRodada({ porTimeout }) {
    this._limparTimers();
    this.estado = ESTADOS.FIM_RODADA;

    const pergunta = this.perguntaAtual();
    const gabarito = pergunta.resposta_correta;
    const resultadosIndividuais = []; 
    const estatisticas = { A: 0, B: 0, C: 0, D: 0 };

    for (const [idDispositivo, resposta] of this.respostasRodadaAtual.entries()) {
      const correta = resposta.alternativa === gabarito;
      estatisticas[resposta.alternativa] = (estatisticas[resposta.alternativa] ?? 0) + 1;

      const tempoRespostaMs = resposta.timestampMs - this.timestampInicioPergunta;
      const pontosGanhos = calcularPontuacao({
        correta,
        tempoRespostaMs,
        tempoLimiteMs: pergunta.tempo_limite_segundos * 1000,
      });

      const pontosAtuais = this.pontuacoes.get(idDispositivo) ?? 0;
      this.pontuacoes.set(idDispositivo, pontosAtuais + pontosGanhos);

      resultadosIndividuais.push({ idDispositivo, correta, pontosGanhos });
    }

    for (const idDispositivo of this.dispositivosConectados.keys()) {
      if (!this.respostasRodadaAtual.has(idDispositivo)) {
        resultadosIndividuais.push({ idDispositivo, correta: false, pontosGanhos: 0 });
      }
    }

    const ehUltimaPergunta = this.indicePerguntaAtual >= this.perguntas.length - 1;
    const rankingAtual = this.obterRanking(); // Calcula o ranking na hora

    const evento = {
      porTimeout,
      gabarito,
      estatisticas,
      resultadosIndividuais,
      ranking: rankingAtual, // Ranking unificado no mesmo evento
    };

    if (ehUltimaPergunta) {
      this.callbacks.onFimDeJogo?.(evento);
    } else {
      this.callbacks.onFimRodada?.(evento);

      // Progressão Automática (5 segundos de intervalo)
      this.intervaloTransicaoHandle = setTimeout(() => {
        const proxima = this._avancarParaProximaPergunta();
        this.callbacks.onProximaPerguntaAutomatica?.(proxima);
      }, 5000);
    }

    return evento;
  }

  // ---------------------------------------------------------------
  // RF11 - Atualização do Ranking Web (Top 5)
  // ---------------------------------------------------------------
  obterRanking() {
    return Array.from(this.pontuacoes.entries())
      .map(([idDispositivo, pontos]) => ({ id: idDispositivo, pontos }))
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 5);
  }

  obterEstadoCompleto() {
    return {
      estado: this.estado,
      indicePerguntaAtual: this.indicePerguntaAtual,
      totalPerguntas: this.perguntas.length,
      dispositivosConectados: this.listarDispositivos(),
      perguntaAtual: this.estado === ESTADOS.PERGUNTA_ATIVA ? this.perguntaAtual() : null,
      ranking: this.obterRanking(),
    };
  }
}