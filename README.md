# Karoonte Server - Orquestrador MQTT 🚀

Este é o cérebro lógico do sistema **Karoonte** (um quiz interativo em tempo real inspirado no Kahoot). Desenvolvido em Node.js, este servidor gerencia o estado da partida, calcula as pontuações com base na velocidade de resposta e orquestra a comunicação MQTT entre os controles físicos (ESP32) e a Interface Web.

## 📋 Pré-requisitos

Para rodar este projeto na sua máquina, você precisará ter instalado:
* **Node.js** (Versão 16 ou superior)
* **Docker** e **Docker Compose** (Para rodar o Broker MQTT localmente)

---

## ⚙️ 1. Configuração Inicial (.env)

O servidor possui um sistema inteligente de **Fallback**. Ele tentará se conectar primeiro a um servidor local; caso falhe, tentará um servidor online. 

Crie um arquivo chamado `.env` na raiz do projeto (na mesma pasta deste README) e preencha com as seguintes chaves:



```env
# Endereço do broker local (Rodando via Docker)
MQTT_BROKER_LOCAL=mqtt://localhost:PORTA

# Endereço do broker na nuvem
MQTT_BROKER_ONLINE=link_broker_mqtt:PORTA

```

---

## 🐳 2. Subindo o Broker Local (Docker)

Para garantir latência zero e não depender de conexões com a internet,  rodamos um broker **Eclipse Mosquitto** localmente.

Abra o terminal na pasta onde está o arquivo `docker-compose.yml` 

```bash
cd broker
```

e execute:

```bash
docker compose up -d
```

> **Nota:** O parâmetro `-d` roda o serviço em segundo plano. Para desligar o broker ao final do uso, execute `docker compose down`.

---

## 🎮 3. Iniciando o Servidor

Com o broker rodando (ou utilizando o online como fallback), instale as dependências e inicie o orquestrador:

1. Instale as bibliotecas necessárias:
```bash
npm install

```


2. Inicie o servidor:
```bash
node src/index.js

```



O console exibirá se a conexão foi estabelecida com o servidor Local ou Online, indicando que o sistema está pronto para receber os comandos da Web e as respostas dos ESP32.

---

## 🤖 4. Simulador de Testes

Para testar o fluxo completo do jogo sem precisar dos ESP32 físicos conectados, criamos um simulador automatizado. Ele cria jogadores falsos e avança a partida sozinho.

Com o servidor rodando em um terminal, abra um **novo terminal** e execute:

```bash
node src/test/simulate.js

```

Você também pode especificar o número de jogadores virtuais passando um número ao final do comando (exemplo para 6 jogadores): `node src/test/simulate.js 6`.

---

## 🔌 5. Integração com ESP32 e Interface Web (Atenção ao IP)

Esta é a etapa mais crítica para conectar o Hardware com o Software.

**O servidor Node.js consegue acessar o broker usando `localhost`, mas o ESP32 e outros computadores na rede NÃO PODEM usar `localhost`.** Eles precisam do Endereço IP real do computador onde o Docker está rodando.

### Passo a passo para a integração:

1. Conecte todos os dispositivos (Computador do servidor, Notebook da Tela Web e os ESP32) **exatamente na mesma rede Wi-Fi** (Recomendamos rotear a internet do celular para evitar bloqueios de segurança de redes públicas/universitárias).
2. Descubra o IP do computador servidor abrindo o terminal e digitando `ipconfig` (Windows) ou `ifconfig` / `ip a` (Mac/Linux). Anote o número do IPv4 (ex: `192.168.1.15`).

### Como configurar o código do ESP32 (C++)

A equipe de hardware deve alterar a variável do broker apontando para o seu IP:

```cpp
const char* mqtt_server = "192.168.1.15"; // Troque pelo IP do PC Servidor
```

### Como configurar o código da Interface Web

A equipe de front-end deve apontar a conexão para o seu IP utilizando o protocolo WebSocket (`ws://`) na porta `8080` (que já está liberada no nosso Docker):

```javascript
const client = mqtt.connect('ws://192.168.1.15:8080'); // Troque pelo IP do PC Servidor

```

---

## 📁 Estrutura do Projeto

| Diretório/Arquivo | Responsabilidade |
| --- | --- |
| `src/index.js` | Ponto de entrada. Carrega variáveis, dados e inicia o servidor. |
| `src/core/gameState.js` | Regras de negócio puro. Controla pontuação, timers e transições. |
| `src/core/scoring.js` | Fórmula matemática de decaimento de pontos por velocidade. |
| `src/mqtt/client.js` | Adaptador MQTT. Converte os comandos de rede em ações do jogo. |
| `src/mqtt/topics.js` | Dicionário contendo as rotas exatas de comunicação (Tópicos MQTT). |
| `src/data/questions.json` | Banco de dados contendo o questionário oficial da partida. |