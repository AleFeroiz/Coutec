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

Na entrada existe somente o botão **Jogar online**. Ele usa diretamente o
servidor configurado em `client/config.js`, sem mostrar ou solicitar endereço
ao jogador. O servidor atual é `https://coutec.onrender.com`.

Para desenvolvimento, ainda é possível executar `npm start` dentro de
`/server` e abrir `http://localhost:3000`, mas esse fluxo não aparece para o
jogador no site publicado.

`onlineServerUrl` não é uma senha: é o endereço público que o navegador precisa
conhecer para abrir a conexão Socket.IO.
