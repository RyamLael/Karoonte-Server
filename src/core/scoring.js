/**
 * RF06 - Computação de Pontuação por Velocidade
 *
 * Fórmula inspirada no Kahoot real:
 *   - Pontuação máxima por pergunta: PONTOS_MAXIMOS
 *   - Decai linearmente conforme o tempo de resposta aumenta
 *   - Respostas na primeira metade do tempo mantém pontuação alta
 *   - Resposta errada = 0 pontos, independente do tempo
 *
 * tempoRespostaMs: tempo entre o START da pergunta e o recebimento
 *                   da resposta (calculado pelo servidor, RNF03 -
 *                   o servidor é o único relógio oficial).
 * tempoLimiteMs: tempo total disponível para a pergunta.
 */

const PONTOS_MAXIMOS = 1000;
const PONTOS_MINIMOS_SE_CORRETO = 500; // piso de pontos para quem acerta, mesmo respondendo no último instante

export function calcularPontuacao({ correta, tempoRespostaMs, tempoLimiteMs }) {
  if (!correta) return 0;

  const fracaoTempoUsado = Math.min(tempoRespostaMs / tempoLimiteMs, 1);
  // Decaimento linear: 1.0 (respondeu instantaneamente) -> 0.0 (respondeu no limite)
  const fatorVelocidade = 1 - fracaoTempoUsado;

  const pontosVariaveis = (PONTOS_MAXIMOS - PONTOS_MINIMOS_SE_CORRETO) * fatorVelocidade;
  const pontosFinal = Math.round(PONTOS_MINIMOS_SE_CORRETO + pontosVariaveis);

  return pontosFinal;
}
