# Servidor do COUTEC

Esta pasta contém o motor de regras e a camada multiplayer Socket.IO. As salas
ficam em memória nesta versão de playtest.

## Playtest local

```bash
npm install
npm start
```

Abra `http://localhost:3000` em três abas. Crie uma sala na primeira e use o
código para entrar nas outras duas.

O processo usa `PORT` (padrão `3000`) e `CLIENT_ORIGIN`, que aceita uma ou mais
origens do front-end separadas por vírgula.

## Rodar os testes

```bash
npm test
```

## Estado atual

Implementado:

- catálogo configurável dos 14 personagens;
- configuração de pool aleatório ou manual;
- banimentos no pool aleatório e no manual;
- baralho com identidade própria para cada cópia física;
- salas, jogadores, mãos e moedas;
- quantidade inicial de moedas configurável pelo host (padrão: zero);
- início de partida exclusivo do host;
- sorteio do primeiro jogador;
- distribuição de duas cartas para cada jogador;
- coleta de uma moeda e passagem de turno;
- obrigatoriedade do Golpe com 10 ou mais moedas;
- resolução de Golpe certo e errado, inclusive contra alvo com uma só carta;
- eliminação, encerramento da partida e definição do vencedor;
- histórico público permanente de cartas reveladas;
- verificação de integridade do total de cartas;
- salas multiplayer em memória via Socket.IO;
- estado privado por jogador, sem enviar mãos adversárias;
- cliente mínimo para playtests locais.
- janela de desafio configurável (padrão de 5 segundos), com votos antecipados;
- cobrança da habilidade no momento do anúncio;
- Jeff Dino, Silvério, Deivison, Paula Granada, Ademar, Sandra, Altimar e
  Luis Sapeca jogáveis;
- expiração de efeitos no começo do próximo turno de quem os criou.

Ainda não implementado:

- efeitos específicos das ações de personagem;
- efeitos de rodada;
- reconexão depois de atualizar ou fechar a página;
- persistência das salas;
- front-end completo e acabamento visual final.

## Decisões pendentes preservadas no código

- O motor só exige valores inteiros positivos para `poolSize` e
  `copiesPerCharacter`; os limites de balanceamento não foram inventados.
- As habilidades estão descritas e parametrizadas, mas ainda não são
  executadas enquanto suas interações pendentes não forem definidas.

O fluxo geral de desafio já está implementado: primeiro desafio aceito, prova
com troca da carta, perda escolhida pelo próprio dono, votos de não desafiar,
cronômetro e cancelamento do blefe.
