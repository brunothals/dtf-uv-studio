# DTF UV Studio

Calculadora DTF UV com gerador local de orçamentos para WhatsApp. Aplicação estática: não requer servidor de API, credenciais nem serviços de IA.

## Usar

Execute `npm start` na raiz (Python 3) e abra a aplicação na porta 3000. Também é possível hospedar os arquivos estáticos em GitHub Pages: configure a branch `main`, pasta raiz, nas configurações do próprio repositório. Esta entrega não publica o site automaticamente.

1. Informe as dimensões e calcule o encaixe.
2. Abaixo do comparativo, clique em **Gerar orçamento**.
3. Selecione comparativo completo, resumido ou formalização; preencha produção, transporte e frete.
4. Confira o total destacado, edite a prévia se desejar e copie ou abra o WhatsApp. O envio exige ação do usuário dentro do WhatsApp.

A seleção, o frete e os demais campos regeneram a mensagem e substituem edições manuais anteriores. O preço com frete distribuído é opcional. Não há prazo de entrega presumido. Para retirada, selecione **Retirada no local** e informe frete `0`.

## Regras e origem dos dados

A base foi copiada de `brunothals/calculadora-dtfuv2`, commit `582266995e6ee929a15e7eea1ce153f96d1186f7`, pois este repositório estava vazio. Nenhum repositório antigo foi alterado. As funções originais de encaixe foram preservadas, assim como os recursos preexistentes, inclusive resumos e salvamento local; não foi implementada nova gestão de pedidos.

O gerador consome os resultados numéricos do mesmo processamento que preenche o comparativo, sem usar quantidades de exemplo. No modo normal, o comparativo original calcula **apenas a primeira arte**, sem a segunda arte proporcional, mesmo quando há múltiplas artes. No modo inverso, usa as quantidades efetivamente encaixadas pelo motor para a combinação solicitada. O gerador informa essa distinção na configuração. A folha personalizada não possui preço cadastrado: somente as quatro folhas padronizadas do comparativo estão disponíveis para orçamento.

Os preços vêm de `FOLHAS_PAD` em `index.html`. Toda a aritmética financeira usa centavos inteiros; divisão e comparação de razões usam `BigInt`. Preços unitários são arredondados para o centavo mais próximo, com empate para cima. O total soma preço da folha e frete, sem multiplicar o preço unitário arredondado. O melhor custo usa a razão exata; em empate, vence o menor preço de folha, seguido pelo identificador em ordem lexical. Folhas com quantidade zero são descritas como sem encaixe e não podem ser selecionadas.

Alterações nos dados da calculadora invalidam o resultado anterior: calcule novamente antes de gerar outro orçamento. O motor original não oferece margens configuráveis; esta implementação não acrescenta margens nem altera sua interpretação do espaçamento (inclusive o comportamento original de substituir zero por 0,3 cm).

Transportadora da lista e prazo de produção são as únicas preferências novas persistidas (`dtf-quote-preferences`). Nome do cliente, transportadora personalizada, frete e observações do orçamento não são persistidos. O recurso preexistente de salvar pedidos mantém seu funcionamento independente. A cópia automática requer contexto seguro e permissão de clipboard; se negada, o texto é selecionado para cópia manual.

## Desenvolvimento e testes

Requisitos: Node.js 24, npm, Python 3 e Chromium para testes de interface.

```sh
npm ci --cache /workspace/.cache/npm
npm test
npm run test:e2e
npm start
```

O Playwright utiliza `/usr/bin/chromium` quando disponível. Em outra máquina, instale o navegador oficial com `npx playwright install chromium` (e dependências de sistema, se necessárias). Os testes de navegador sobem e encerram seu próprio servidor quando não existe um na porta 3000.

- `quote-core.js`: validação, moeda, custo unitário, melhor opção, mensagens e URL oficial de compartilhamento.
- `quote-ui.js`: modal responsivo, integração, preferências e ações.
- `tests/quote.test.cjs`: cálculos, arredondamento, entradas inválidas, modos e URL.
- `tests/browser/quote.spec.cjs`: integração com resultados reais, seleção, frete, edição, clipboard real, interceptação da abertura do WhatsApp, preferências e largura do modal em desktop e celular.

Os testes verificam a URL e mensagem do compartilhamento sem enviar mensagens ou acessar contas do WhatsApp. Não exigem login ou integrações com transportadoras.
