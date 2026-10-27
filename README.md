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

O gerador consome os resultados numéricos do mesmo processamento que preenche o comparativo, sem usar quantidades de exemplo. No modo normal com **Preencher folha**, o comparativo usa a grade da arte única (colunas × linhas). Com **Múltiplas artes**, o comparativo considera **todas as artes do pedido**: cada folha é preenchida repetindo o pedido inteiro, na proporção das quantidades, com o mesmo motor `packArts`. A tabela mostra se o pedido cabe (itens encaixados/solicitados), quantos pedidos completos cabem e o total de artes na folha (pedidos completos mais cópias extras que ainda cabem sem desfazer os completos), com a divisão por arte. A segunda arte proporcional continua fora do comparativo. No modo inverso, usa as quantidades efetivamente encaixadas pelo motor para a combinação solicitada. O gerador informa essa distinção na configuração.

Os preços vêm de `FOLHAS_PAD` em `index.html`.

**Folha sob medida.** A folha personalizada (modo normal) e o tamanho mínimo calculado (modo inverso) entram no comparativo e no orçamento. O preço usa o campo **R$ por cm de comprimento** (centavos × décimos de cm, arredondado ao centavo). Com o campo vazio, a calculadora usa uma **estimativa** marcada com `*`: interpolação linear entre as folhas padrão vizinhas; abaixo de 21 cm vale o preço da menor folha e acima de 100 cm é proporcional à folha de 100 cm. Não há preço inventado além da tabela.

**Revenda (opcional).** Em **Preços e revenda**, escolha *Preço de venda por arte* (R$) ou *Margem sobre o custo* (%). O padrão é *Não calcular*, sem valores. O comparativo sempre mostra o custo por arte (folha ÷ artes que cabem) e, com revenda ativa, a venda por arte, a receita e o lucro por folha cheia. A margem é guardada em centésimos de ponto percentual; a venda por arte é `folha × (100% + margem) ÷ quantidade`, arredondada ao centavo com `BigInt`; receita = venda por arte × quantidade e lucro = receita − folha (pode ser negativo). As três configurações ficam em `dtf-pricing-preferences` neste navegador. A mensagem de orçamento para o cliente não foi alterada. Toda a aritmética financeira usa centavos inteiros; divisão e comparação de razões usam `BigInt`. Preços unitários são arredondados para o centavo mais próximo, com empate para cima. O total soma preço da folha e frete, sem multiplicar o preço unitário arredondado. O melhor custo usa a razão exata; em empate, vence o menor preço de folha, seguido pelo identificador em ordem lexical. Folhas com quantidade zero são descritas como sem encaixe e não podem ser selecionadas.

Alterações nos dados da calculadora invalidam o resultado anterior: calcule novamente antes de gerar outro orçamento. O motor original não oferece margens configuráveis; esta implementação não acrescenta margens. O espaçamento é aplicado apenas entre artes. **Espaçamento 0 é aceito** (antes era trocado silenciosamente por 0,3 cm), igual à montadora; campos vazios ou negativos bloqueiam o cálculo.

Transportadora da lista e prazo de produção são persistidos em `dtf-quote-preferences`; tipo/valor de revenda e preço por cm, em `dtf-pricing-preferences`. Nome do cliente, transportadora personalizada, frete e observações do orçamento não são persistidos. O recurso preexistente de salvar pedidos mantém seu funcionamento independente. A cópia automática requer contexto seguro e permissão de clipboard; se negada, o texto é selecionado para cópia manual.

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
- `tests/quote.test.cjs`: cálculos, arredondamento, entradas inválidas, modos, URL, preço sob medida e revenda.
- `tests/browser/calculator.spec.cjs`: comparativo com múltiplas artes, espaçamento zero, revenda e persistência, folha sob medida no orçamento, rótulos e botão **Montar esta folha na montadora**.
- `tests/browser/quote.spec.cjs`: integração com resultados reais, seleção, frete, edição, clipboard real, interceptação da abertura do WhatsApp, preferências e largura do modal em desktop e celular.

Os testes verificam a URL e mensagem do compartilhamento sem enviar mensagens ou acessar contas do WhatsApp. Não exigem login ou integrações com transportadoras.

## Plataforma unificada: montadora de artes

A página inicial mantém a calculadora e os orçamentos. O botão **Montar esta folha na montadora**, ao lado do layout calculado, abre a montadora em outra aba com a largura, o comprimento e o espaçamento da folha e a lista de artes (medida e quantidade encaixada) na URL: `montadora/?origem=calculadora&w=29&h=42&esp=0.3&arte=10x8x4&arte=5x4x6`. Imagens não podem ir pela URL: ao importar os PNGs/PDFs na mesma ordem da lista, cada arte recebe a quantidade e a medida calculadas, contida no retângulo indicado sem deformar a imagem. Nada é enviado ou salvo. Parâmetros inválidos são ignorados e a montadora abre com o padrão (`montadora-src/src/utils/calcPrefill.ts`). O link **Montadora de artes** abre o módulo integrado em `montadora/`, no mesmo site e repositório, com navegação de volta à calculadora. Não é necessário login externo; os arquivos são processados localmente e não são enviados a um servidor.

A montadora foi integrada a partir do `brunothals/dtf-gang-sheet`, commit `c95d1ff62e0846b76deb1bfd494ade03b335f8d4`, preservando importação PNG/PDF, quantidades, rotação, modos de montagem, preenchimento, folha sob medida e exportação PNG. Nenhum repositório antigo foi alterado. O código editável está em `montadora-src/`; `montadora/` contém a distribuição gerada e versionada para continuar funcionando em hospedagem estática por branch, sem depender de um servidor de aplicação.

### Correções de tamanho e qualidade

- O encaixe agora ocorre em uma malha física fixa de 0,001 mm; o DPI só converte o layout final para pixels. Mudar espaçamento altera as posições/quantidades que cabem, sem redimensionar as artes. Prévia, exportação e redimensionamento de prévia recuperam a mesma geometria original.
- Margem e espaçamento zero são aceitos sem a margem artificial de 1 pixel. Os tamanhos das artes não são mais alterados para aproximar a resolução da fonte.
- **Recortar folha ao conteúdo** fica ativado por padrão, inclusive em folha sob medida. Ele remove a área externa vazia, mantendo a área ocupada e as margens escolhidas, sem mudar o tamanho de impressão ou o espaçamento das artes. A prévia acompanha esse recorte. É possível desativá-lo para visualizar e exportar a folha inteira. A interface mostra as dimensões finais da exportação, incluindo o recorte quando selecionado. Tamanhos raster têm arredondamento de até aproximadamente um pixel; ao importar no editor/RIP, utilize o DPI embutido e escala de 100%, sem ajustar à página.
- **Máxima** preserva a densidade de pixels das fontes. A prévia reduzida não é usada como imagem de exportação. Exemplo coberto por teste: arte de 64 × 32 pixels a 0,2 cm mantém os 64 × 32 pixels e os detalhes pixel a pixel a 813 DPI. Forçar 300 DPI nesse tamanho gera aproximadamente 24 × 12 pixels: a interface avisa quando a seleção reduz a resolução.
- Nenhuma resolução é reduzida silenciosamente para contornar falta de memória. Folhas grandes são divididas em PNGs separados, sem ZIP. Cada arquivo usa no máximo 8192 pixels por lado e 16.777.216 pixels (64 MiB de RGBA); apenas uma parte é renderizada por vez. O PNG preserva DPI, escala, transparência e fontes originais. O canvas e a URL de download são liberados antes da próxima parte. Os limites efetivos ainda dependem da memória disponível no navegador.

### PDFs e fundo branco

PDFs sem fundo desenhado são importados com transparência. PDFs que contêm um retângulo branco opaco mantêm esse branco por padrão: apagar toda cor branca destruiria partes da arte. A opção **Remover fundo branco externo do PDF**, aplicada antes de importar, remove pixels quase brancos conectados às bordas e preserva áreas brancas internas fechadas. Não a ative se o branco conectado à borda fizer parte do desenho. Ela não é um removedor geral de fundos coloridos ou fotografias.

A rasterização do PDF pode ser escolhida em 300, 600 (padrão) ou 1200 DPI antes da importação. O limite de memória pode reduzir páginas grandes, com aviso. Aumentar DPI não recupera detalhes ausentes de imagens já rasterizadas no PDF. A exportação da montadora é PNG transparente; não foi acrescentada exportação PDF vetorial.

### Comandos da montadora

```sh
npm run dev:montadora  # desenvolvimento do módulo React/Vite
npm run build         # verifica TypeScript e regenera montadora/
npm start             # compila e serve toda a plataforma na porta 3000
npm test              # testes financeiros e de mensagens
npm run test:e2e      # compila e testa calculadora, orçamentos e montadora
```

Os testes da montadora usam imagens e PDFs sintéticos, verificam os bytes do PNG e seu DPI, transparência, branco interno/externo do PDF, rotação, folha sob medida e espaçamentos de 0, 0,2 e 0,4 cm nos quatro modos de montagem a 150, 300 e 813 DPI. A interface compilada também é exercitada em desktop e celular. O runner inicia servidores temporários nas portas 3000 e 5174.


### Recorte, espaçamentos, exclusão e fundo da prévia

- **Recortar bordas da arte** é independente de recortar a folha: atua sobre os pixels transparentes externos de cada importação, sem reamostrar os pixels restantes. Ligado por padrão, com sensibilidade alpha **0**: somente pixels com alpha maior que zero delimitam a arte, preservando transparências suaves, branco e pequenos detalhes. A sensibilidade maior ignora pixels abaixo do limiar para determinar a borda; se nenhum pixel atingir o limiar, usa os pixels visíveis para não transformar a arte em uma peça vazia. Arquivos totalmente transparentes são rejeitados, mesmo com o recorte desligado.
- O campo **Lado (cm)** continua definindo o maior lado de impressão da arte ativa após o recorte; o outro lado é proporcional. Recortar pixels vazios não altera os pixels do desenho. Para manter a escala de impressão desejada, confira as medidas por arte na lista.
- **Espaço H (cm)** e **Espaço V (cm)** são independentes em Aproveitar espaço/MaxRects, Grade, Agrupar fileiras e Agrupar colunas. Ambos começam em **0,3 cm** e aceitam zero. **Margem (cm)** controla as bordas da folha, também aceitando zero. O layout usa milésimos de milímetro e só converte para pixels na visualização/exportação. Bordas adjacentes arredondam para o mesmo pixel, evitando sobreposições de um pixel em espaçamento zero; dimensões raster podem variar em até um pixel em relação à medida física.
- Cada item possui **Excluir arte**, visível também no celular. **Excluir selecionadas** remove as artes marcadas. A montagem e as estimativas são atualizadas, preservando folha e espaçamentos; excluir a última arte limpa a prévia e os botões de exportação. Durante o recálculo, a exportação fica desabilitada para evitar uma prévia antiga.
- **Fundo da prévia** oferece Escuro (padrão), Claro, Quadriculado e Cor personalizada. A cor é aplicada somente ao contêiner visual: não é desenhada no canvas e não aparece nos PNGs da folha ou na arte baixada individualmente. Trocar o fundo não recalcula o encaixe nem modifica as fontes. A preferência permanece apenas durante a sessão da página.

Os testes de navegador incluem os quatro modos, gaps de 0/0,2/0,3/0,4 cm e eixos diferentes, margens, quantidades, ausência de sobreposição e extravasamento, recorte alpha zero, rejeição de artes vazias, exclusão individual/múltipla/última e fundos de prévia em desktop/celular. Os PNGs baixados são decodificados para verificar dimensões, transparência e branco; os bytes do PNG são comparados antes/depois de trocar o fundo.


### Exportação de folhas grandes em PNGs separados

O botão **Baixar PNGs** envia arquivos PNG individuais, tanto para várias folhas quanto para uma folha que ultrapasse os limites por arquivo. Não gera ZIP. O número de PNGs aparece antes do download; o progresso informa a parte atual e é possível parar após essa parte.

A divisão recorta a folha em linhas e colunas e prioriza corredores vazios entre as artes, sem redimensionar, repaginar, adicionar margem interna ou sobrepor pixels. **Quando uma arte ultrapassa os limites de uma parte ou não há corredor suficiente, ainda pode atravessá-la**: a interface avisa antes do download e destaca as partes afetadas em laranja. As margens e os espaçamentos originais permanecem na composição. Imprima a 100%, sem ajustar à página. Nomes como `gang-parte-02-L1-C2-x4096-y0.png` indicam a ordem e a posição exata em pixels na folha exportada (após o recorte, quando ativado). A última parte de cada eixo pode ser menor. Folhas que já cabem continuam gerando um único PNG.

Permita vários downloads no navegador para baixar todas as partes automaticamente. A lista **Partes PNG** permite baixar novamente qualquer arquivo individualmente, inclusive quando o navegador bloquear downloads automáticos. Ela contém descrições das partes, não cópias de todos os PNGs na memória; cada arquivo é gerado quando solicitado. Alterar artes ou configurações cancela a sequência após a parte atual e limpa a lista antiga.


### Editor de artes e corte organizado

- O computador usa a largura disponível: editor de artes à esquerda e prévia expansível à direita. Em telas de até 950 px os painéis ficam empilhados, com atalhos **Editar artes** e **Ver prévia**. Campos e ações não exigem rolagem lateral. O zoom pode gerar rolagem apenas dentro da prévia.
- Cada arte mostra nome, miniatura, **Largura**, **Altura**, **Quantidade**, cadeado de proporção e **X para excluir**. Editar largura ou altura mantém a razão da fonte por padrão. Desmarcar **Manter proporção** permite medidas independentes com aviso de possível deformação; remarcar restaura a proporção da fonte mantendo a largura impressa. A rotação de 90° troca os eixos de edição sem alterar escala ou DPI necessário.
- **Duplicar tamanho** cria uma variante com imagem original compartilhada e configurações independentes. É possível usar a mesma arte em diversos tamanhos e quantidades sem reimportar. Alterações de corte mantêm os grupos e as variantes; proporção travada acompanha a fonte reprocessada.
- **Editar selecionadas** permite aplicar quantidade, largura e identificação de pedido às marcadas; o botão **90° sel.** gira as marcadas. **Excluir selecionadas** e **Limpar** permitem desfazer a última exclusão por 60 segundos. Nenhum arquivo ou identificação de pedido é enviado a um servidor ou persistido por esses novos controles.
- **Corte organizado** (padrão; implementação Grade) monta fileiras alinhadas. Peças mais altas vêm primeiro e outras podem completar a largura restante, respeitando espaço H/V, margem, medidas e quantidade. **Agrupar por arte / pedido** mantém cada arte em fileiras contíguas e aproxima as artes com a mesma identificação de pedido. **Agrupar colunas** permanece disponível. **Máximo aproveitamento** mantém o MaxRects para quem prefere ocupação compacta, podendo exigir mais cortes. Mudar o comprimento da folha não altera o modo escolhido.
- Largura personalizada está disponível além das larguras de 29 e 41 cm. A interface informa contagem solicitada/montada, medidas da exportação e ocupação aproximada dos retângulos no arquivo exportado, incluindo o recorte quando ativo. A porcentagem não calcula a área real da silhueta de cada desenho.
- A prévia usa as fontes completas com imagem limitada a 1400 px por lado; **Ajustar à área**, 150%, 200% e 300% são controles exclusivamente visuais. Clicar numa peça seleciona sua arte e destaca as cópias; Ctrl/Cmd permite seleção adicional. Pelo teclado, Enter na prévia seleciona a primeira arte, e todas podem ser marcadas na lista.
- Guias azuis indicam cortes entre fileiras e peças em Corte organizado/Agrupar fileiras; verdes mostram partes PNG; laranja sinaliza partes que atravessam uma arte. Guias, seleção e fundo nunca são desenhados nos PNGs. Não foi acrescentada edição manual por arrastar.
- As opções de PDF e sensibilidade ficam em **Opções de PDF e recorte**. Páginas totalmente transparentes são informadas individualmente e não impedem importar as páginas válidas seguintes.

A suíte de navegador também verifica a nova edição em desktop e celular: três artes com medidas distintas, ausência de rolagem horizontal de 320 a 1920 px, variantes, proporção, rotação, lotes, pedidos, exclusão/desfazer, seleção na prévia, zoom sem alteração dos bytes exportados, corredores de corte e PDFs com páginas vazias no início/meio/fim.


## Opções adicionais de otimização e download

Os modos existentes e os padrões continuam disponíveis sem mudanças.

- **Otimização avançada (novo)**: compara seis combinações de ordenação/encaixe e mantém o melhor resultado, incluindo o MaxRects atual como referência. Em lotes maiores, limita as tentativas para reduzir processamento. Na tira de comprimento automático, testa comprimentos menores; é uma heurística, sem garantia de ótimo global.
- **Girar cópias automaticamente**: disponível somente no modo novo e pode ser desligado. Permite orientações diferentes entre cópias do mesmo modelo, preservando tamanho, proporção, quantidade, margem e os espaços horizontal e vertical independentes. A rotação manual dos modos antigos continua funcionando.
- **Download PNG → Automático (atual)**: conserva o comportamento anterior e os limites de memória por parte.
- **Download PNG → Folha inteira**: um PNG por folha montada. No comprimento automático, exporta a tira contínua inteira. O codificador processa pequenas faixas, sem canvas gigante e sem reduzir DPI; requer CompressionStream e limita a saída comprimida a 512 MiB. Não une folhas independentes nem completa uma montagem que tenha erros.
- **Download PNG → Várias folhas — sem cortar artes**: remonta o pedido em folhas independentes no comprimento escolhido, mantendo cada arte inteira. A prévia acompanha a paginação, cada folha vira um PNG e as medidas anteriores são recuperadas ao sair desta opção.
- **Download PNG → Dividir em várias partes**: permite definir o comprimento máximo por parte. Limites de pixels podem subdividir também na largura. Procura corredores livres; caso não exista um corte seguro, mostra a advertência e as guias laranja. As partes preservam coordenadas, pixels, transparência e DPI, mas não são uma nova paginação. Para várias folhas sem cortar artes, escolha comprimento fixo antes de montar.

Prévia, guias e quantidade de PNGs acompanham a escolha de download. Alterar a escolha limpa a lista de downloads anterior. Os fundos da prévia não entram nos PNGs.

As melhorias são locais ao navegador, sem API, chave ou cobrança por montagem. O limite existente da tira automática continua em 500 cm.


## Preparação e conferência DTF UV (opcional)

Todas as quatro opções iniciam **desligadas** e não usam API. Abra o painel correspondente para escolher o que usar.

- **Limpar pixels isolados**: remove componentes de até 1–100 pixels usando conectividade de oito vizinhos, mantendo sempre o maior componente. O limite padrão é 4 pixels. Branco e antialias conectados ao desenho são preservados; pontos de letras e detalhes separados podem ser removidos, por isso há comparação visual. Não é remoção de fundo branco.
- **Engrossar traços**: expansão de alpha por disco de 1–3 pixels da imagem original. Acrescenta margem para não cortar tinta nas bordas e conserva as cores nos pixels já existentes. A expansão pode fechar vazados estreitos.
- Os dois ajustes só entram após **Aplicar às selecionadas**. Novas importações permanecem originais até aplicar. O processamento começa sempre do canvas original, sem acumular engrossamento. As artes guardam os parâmetros e a contagem de pixels alterados. Comparação original/resultado e restauração por arte ou seleção ficam disponíveis. Prévia, PNG individual e folhas usam o resultado.
- O lado maior físico solicitado é mantido nos ajustes com proporção travada. Medidas independentes continuam explícitas. O arquivo original e a quantidade não são sobrescritos.
- **Alertar baixa resolução**: mostra a densidade da imagem no tamanho físico de impressão, pelo eixo mais fraco; referência ajustável de 72–1200 DPI, padrão 300. O alerta é informativo. Definir mais DPI no export não aumenta a resolução da fonte.
- **Conferir quantidades antes de baixar**: exibe o pedido e a quantidade montada por ID de modelo; com a opção ligada, uma divergência impede exportar folhas. Detecta modelos trocados mesmo quando o total é igual. Compara com a lista atual, incluindo alterações manuais e cópias extras pedidas; não lê quantidades dos nomes dos arquivos.

Para limitar a memória, a preparação é aceita até 16 megapixels por arte. Uma falha mantém o estado anterior da arte e informa o problema. Desmarcar as opções e aplicar ou usar Restaurar recupera a imagem original com o recorte vigente.


## DTF UV Mania: confirmação e aprovação do cliente

O logo foi obtido do cabeçalho oficial de https://www.dtfuvmania.com.br/ em 26/10/2026 (arquivo original em `assets/dtfuvmania-logo.jpg`, URL de origem `https://images.tcdn.com.br/img/img_prod/1571477/1791756712_4c70d6cd37bb8b2f.jpg`). A identidade usa o rosa `#ff2eaa`, preto e branco do site, com ciano e amarelo do logo. O arquivo é local, sem hotlink na geração da aprovação.

Na calculadora, Gerar orçamento conserva os modos anteriores e acrescenta Confirmação curta do pedido e o botão Copiar confirmação. A mensagem inclui número do pedido, nome, folha escolhida, modelos, medidas, quantidades, cores, produto, transportadora, frete, total e prazo. O cliente não é marcado como aprovado ou pago. O encaixe calculado continua identificado como estimativa pelas medidas. As novas opções de transporte incluem SEDEX, Correios/PAC, Loggi e J&T; o frete é informado manualmente.

**Continuar na montadora** transfere a folha escolhida no orçamento (não necessariamente a selecionada na tela principal), cores e contagens de cada modelo, dados comerciais e cliente. As imagens devem ser importadas na ordem indicada. O link contém um identificador aleatório; nome e valores ficam em cache no mesmo navegador/origem, por até 24 horas. Não há servidor, conta, API, envio de imagens ou cotação de frete. Caches vencidos desse recurso são removidos na próxima transferência. Esse link interno não substitui o JPG para enviar ao cliente. Limites da transferência: 50 modelos, folha até 500 cm.

Na montadora, o painel Pedido e aprovação do cliente permite revisar os dados. Uma alteração na quantidade/tamanho de folha ou número de folhas em relação à cotação exibe aviso para revisar o valor. Os valores não são recalculados pela montadora. Cor/acabamento é metadado, sem recolorir pixels. Há nome opcional para cada modelo na aprovação; o nome padrão retira extensão e o sufixo de cópia do arquivo.

Baixar aprovação gera um JPG separado, com logo, nome, pedido, revisão, data de São Paulo, um exemplar por modelo ativo, medida proporcional, quantidade e cor. O rodapé informa folhas de montagem, total de peças, valores preenchidos e prazo de produção. A folha de impressão pode ter recorte de vazios independente; o tamanho de folha informado no comprovante é o da montagem. O fundo de cada arte pode ser claro, escuro ou automático (para visualizar branco). O comprovante é identificado como aprovação, sem alterar os PNGs de produção.

Escolha uma imagem única ou páginas de 12 modelos. A imagem única tem limite de 16 megapixels e 16384 px de altura; excesso solicita paginação em vez de omitir modelos. A opção Baixar aprovação junto com os PNGs é desligada por padrão. A prévia é invalidada ao alterar pedido, artes, medidas, quantidades, cores ou revisão; geração que fica desatualizada não é baixada. Copiar confirmação do pedido usa a montagem real conferida, com produto/frete/prazo informados. Nenhuma mensagem é enviada automaticamente ao cliente.
