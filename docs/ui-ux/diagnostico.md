# Diagnóstico de UI/UX

## Produto e público

O ChamaAI é um sistema offline-first de filas, operação de guichês, totens, telões, encartes e mídia indoor. Seu público combina administradores, operadores, clientes em atendimento e espectadores a distância. Isso exige mais de uma densidade visual: administração eficiente, operação inequívoca, toque acessível e exibição de longa distância.

## Identidade existente

Há uma base aproveitável: roxo real e teal, superfícies claras, Syne para expressão e DM Sans para leitura. Contudo, `DESIGN.MD`, Tailwind e componentes divergem. O Tailwind configura Inter sem importá-la, enquanto o CSS importa Syne e DM Sans. Algumas telas usam slate/azul, outras roxo, glassmorphism, gradientes ou linguagem de broadcast.

## Evidências quantitativas

- 33 arquivos TSX e 28 rotas declaradas.
- 172 ocorrências de cores hexadecimais e 77 blocos de estilo inline.
- 791 classes de arredondamento e 302 de sombra.
- 531 usos de caixa alta e 420 de `tracking-widest`.
- 255 botões, 127 inputs e nenhuma ocorrência textual de atributos `aria-*` ou `role=` na varredura inicial.
- O detector do Impeccable retornou 337 achados: 289 advisories e 48 warnings.

Distribuição dos achados do Impeccable:

| Regra | Quantidade |
|---|---:|
| Tamanho tipográfico fora do `DESIGN.md` | 220 |
| Cor fora do `DESIGN.md` | 66 |
| Borda de destaque em elemento arredondado | 11 |
| Easing bounce/elastic | 10 |
| Fonte fora do `DESIGN.md` | 9 |
| Borda lateral de destaque | 8 |
| Texto em gradiente | 4 |
| Paleta reconhecível como padrão de IA | 3 |
| Cinza sobre fundo colorido | 3 |
| Raio fora do `DESIGN.md` | 3 |

Arquivos com maior concentração: `Configuracoes.tsx` (47), `ToledoConfig.tsx` (31), `index.css` (31), `EncarteGranel.tsx` (27) e `Dashboard.tsx` (18).

## Problemas prioritários

1. **Fonte de verdade fragmentada.** Tokens, configuração Tailwind e estilos locais competem entre si.
2. **Hierarquia textual ruidosa.** Caixa alta, letter-spacing e tamanhos arbitrários reduzem escaneabilidade.
3. **Vocabulário de componentes inconsistente.** Controles equivalentes mudam de forma, raio, cor e sombra entre telas.
4. **Responsividade por exceção.** Regras fixas de viewport, overflow global e layouts específicos dificultam celular, tablet e orientação horizontal.
5. **Acessibilidade não sistematizada.** Foco, semântica, reduced motion e alvos de toque dependem de implementações locais.
6. **Estados assíncronos desiguais.** Loading, erro, vazio, offline e sincronização não compartilham um contrato visual.
7. **Custo visual em hardware limitado.** Blur, sombras amplas e animações contínuas precisam ser tratados como orçamento, especialmente no telão.

## Limites da auditoria

O detector é estático: um advisory sinaliza desvio do sistema documentado, não prova defeito funcional. A validação definitiva exige renderização, teclado, leitor de tela, resoluções reais e medição de desempenho durante a implementação.