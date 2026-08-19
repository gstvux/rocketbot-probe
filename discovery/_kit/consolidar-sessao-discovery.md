# prompt cru de intenção
consideracoes para esse projeto
~/projects/rocketbot-probe:







a mecanica que espero para um projeto de automação é:



conforme vou recebendo insumos: arquivos, conversas, multimidias sobre um processo a ser automatizado







salvo em 'sources/' organizada por chegada, cada chegada é referente a uma 'session' por isso pastas ordenadas 'sessionsN' ou só 'N' sendo N o numero da sessão







para cada sessão, eu faço rodadas de discovery (rocketbot-probe skills)



que gera docs de documentação que, constituem em sua totalidade base de conhecimento sobre o processo a ser automatizado: com a finalidade de servir apresentação, comunicação, contexto e organização. São documentações acionáveis.







a partir dessas probes, crio inferências de desenvolvedor para direcionar o desenvolvimento (prompt ou .md direto na pasta discovery/​), onde complemento com pesquisa, decisões e direcionamentos sobre o desenvolvimento. servirão de contexto para agentes executar os planos. 

---

# prompt estruturado

## **Objetivo**

Estabelecer um fluxo de Discovery contínuo e incremental para projetos de automação (RPA/Bots), construindo uma base de conhecimento acionável que direcione a execução de agentes de código.

### **Estrutura e Fluxo de Execução**

## 1. Ingestão de Insumos (’sources/’)

- **Entrada:** Arquivos, conversas e mídias do processo a ser automatizado.
- **Organização:** Ordenado por sessões em `sources/session-N` (ou `N`), de forma cronológica.

## 2. Execução de Discovery (’rocketbot-probe’)

- Para cada nova sessão em `sources/`, executar as skills de análise da `rocketbot-probe`.
- **Saída:** Documentos `.md` estruturados que atualizam e expandem incrementalmente a base de conhecimento sobre o processo (regras, fluxos, exceções, etc.).

## 3. Análise e Inferências do Desenvolvedor (’discovery/’)

- O desenvolvedor analisa os artefatos de Discovery e insere diretamente em `discovery/` suas inferências e orientações técnicas:
    - Pesquisas técnicas e decisões de arquitetura.
    - Seletores, mapeamento de interface e exceções identificadas.
    - Prompts ou arquivos `.md` contendo especificações técnicas de desenvolvimento.

### **Regra Operacional para Agentes de Código**

> Toda a documentação gerada na pasta `discovery/` (Discovery incremental das sessões + Inferências do Dev) constitui o **contexto definitivo e acionável**. Os agentes devem utilizá-la como instrução primária para plano de ação e geração de código do robô.
>