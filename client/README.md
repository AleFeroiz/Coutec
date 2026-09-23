# Cliente mínimo do COUTEC

Interface sem framework para playtests do fluxo multiplayer básico.

A tela da partida usa uma mesa vista de cima, adversários ao redor, mão do
jogador na parte inferior e controles contextuais no centro.

Ao começar, ela apresenta o catálogo do pool. Efeitos ativos recebem sinais
visuais simples, como o dinossaurinho, a caverna e a nuvem do repositório.

Uma introdução curta apresenta a FATEC Itapetininga. Na mesa, um prédio
estilizado do Centro Paula Souza funciona como origem visual das moedas
coletadas.

No desenvolvimento local, execute `npm start` dentro de `/server` e abra
`http://localhost:3000` em três abas. Cada aba representa um jogador.

O cliente também pode ser hospedado como site estático. Nesse caso, informe na
tela inicial a URL pública do servidor da Render.
