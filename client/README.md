# Cliente mínimo do COUTEC

Interface sem framework para playtests do fluxo multiplayer básico.

A tela da partida usa uma mesa vista de cima, adversários ao redor, mão do
jogador na parte inferior e controles contextuais no centro.

Ao começar, ela apresenta o catálogo do pool. Efeitos ativos recebem sinais
visuais simples, como o dinossaurinho, a caverna e a nuvem do repositório.

Uma introdução curta apresenta a FATEC Itapetininga. Na mesa, um prédio
estilizado do Centro Paula Souza funciona como origem visual das moedas
coletadas.

Dívidas do Rodrigo e requisitos do Marcelo aparecem como indicadores sobre o
jogador afetado e interrompem o começo do turno quando uma carta precisa ser
escolhida.

Na entrada existem dois modos de conexão:

- **Offline / local:** execute `npm start` dentro de `/server`, abra
  `http://localhost:3000` e escolha "Jogar localmente". Cada aba representa um
  jogador. Esse modo não precisa de internet, mas precisa do motor Node local.
- **Online:** publica-se `/server` na Render e `/client` na Vercel. Cole a URL
  gerada pela Render em `client/config.js`; ela será preenchida automaticamente
  para todos os jogadores. O campo da tela também permite trocar a URL durante
  testes e guarda a escolha no navegador.

`onlineServerUrl` não é uma senha: é o endereço público que o navegador precisa
conhecer para abrir a conexão Socket.IO.
