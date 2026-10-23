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

## Plataforma unificada: montadora de artes

A página inicial mantém a calculadora e os orçamentos. O link **Montadora de artes** abre o módulo integrado em `montadora/`, no mesmo site e repositório, com navegação de volta à calculadora. Não é necessário login externo; os arquivos são processados localmente e não são enviados a um servidor.

A montadora foi integrada a partir do `brunothals/dtf-gang-sheet`, commit `c95d1ff62e0846b76deb1bfd494ade03b335f8d4`, preservando importação PNG/PDF, quantidades, rotação, modos de montagem, preenchimento, folha sob medida e exportação PNG/ZIP. Nenhum repositório antigo foi alterado. O código editável está em `montadora-src/`; `montadora/` contém a distribuição gerada e versionada para continuar funcionando em hospedagem estática por branch, sem depender de um servidor de aplicação.

### Correções de tamanho e qualidade

- O encaixe agora ocorre em uma malha física fixa de 0,001 mm; o DPI só converte o layout final para pixels. Mudar espaçamento altera as posições/quantidades que cabem, sem redimensionar as artes. Prévia, exportação e redimensionamento de prévia recuperam a mesma geometria original.
- Margem e espaçamento zero são aceitos sem a margem artificial de 1 pixel. Os tamanhos das artes não são mais alterados para aproximar a resolução da fonte.
- **Recortar folha ao conteúdo** fica desativado por padrão, inclusive em folha sob medida. O recorte é uma escolha explícita que muda as dimensões da folha, nunca o tamanho de impressão das artes. A interface mostra as dimensões finais da exportação, incluindo o recorte quando selecionado. Tamanhos raster têm arredondamento de até aproximadamente um pixel; ao importar no editor/RIP, utilize o DPI embutido e escala de 100%, sem ajustar à página.
- **Máxima** preserva a densidade de pixels das fontes. A prévia reduzida não é usada como imagem de exportação. Exemplo coberto por teste: arte de 64 × 32 pixels a 0,2 cm mantém os 64 × 32 pixels e os detalhes pixel a pixel a 813 DPI. Forçar 300 DPI nesse tamanho gera aproximadamente 24 × 12 pixels: a interface avisa quando a seleção reduz a resolução.
- Nenhuma resolução é reduzida silenciosamente para contornar falta de memória. Exportações com buffer RGBA acima de 512 MiB são recusadas com orientação para recortar o vazio, reduzir a folha ou escolher outro DPI. Arquivos grandes dentro do limite podem usar faixas; os limites efetivos dependem do navegador.

### PDFs e fundo branco

PDFs sem fundo desenhado são importados com transparência. PDFs que contêm um retângulo branco opaco mantêm esse branco por padrão: apagar toda cor branca destruiria partes da arte. A opção **Remover fundo branco externo do PDF**, aplicada antes de importar, remove pixels quase brancos conectados às bordas e preserva áreas brancas internas fechadas. Não a ative se o branco conectado à borda fizer parte do desenho. Ela não é um removedor geral de fundos coloridos ou fotografias.

A rasterização do PDF pode ser escolhida em 300, 600 (padrão) ou 1200 DPI antes da importação. O limite de memória pode reduzir páginas grandes, com aviso. Aumentar DPI não recupera detalhes ausentes de imagens já rasterizadas no PDF. A exportação da montadora é PNG transparente/ZIP; não foi acrescentada exportação PDF vetorial.

### Comandos da montadora

```sh
npm run dev:montadora  # desenvolvimento do módulo React/Vite
npm run build         # verifica TypeScript e regenera montadora/
npm start             # compila e serve toda a plataforma na porta 3000
npm test              # testes financeiros e de mensagens
npm run test:e2e      # compila e testa calculadora, orçamentos e montadora
```

Os testes da montadora usam imagens e PDFs sintéticos, verificam os bytes do PNG e seu DPI, transparência, branco interno/externo do PDF, rotação, folha sob medida e espaçamentos de 0, 0,2 e 0,4 cm nos quatro modos de montagem a 150, 300 e 813 DPI. A interface compilada também é exercitada em desktop e celular. O runner inicia servidores temporários nas portas 3000 e 5174.
