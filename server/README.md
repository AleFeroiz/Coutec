# Motor do COUTEC

Esta pasta contém o motor puro de regras. Ele ainda não abre servidor HTTP nem
conexões Socket.IO; a camada de rede só será adicionada depois das regras
isoladas estarem testadas.

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
- verificação de integridade do total de cartas.

Ainda não implementado:

- ações e desafios das cartas de personagem;
- efeitos de rodada;
- rede Socket.IO e front-end.

## Decisões pendentes preservadas no código

- O motor só exige valores inteiros positivos para `poolSize` e
  `copiesPerCharacter`; os limites de balanceamento não foram inventados.
- As habilidades estão descritas e parametrizadas, mas ainda não são
  executadas enquanto suas interações pendentes não forem definidas.
