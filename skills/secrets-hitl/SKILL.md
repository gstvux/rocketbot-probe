---
name: secrets-hitl
description: >
  Use esta skill sempre que a automação precisar de credencial — senha de portal, token de API,
  certificado, chave de serviço de captcha — ou quando existir uma etapa de autenticação que só o
  humano pode cumprir. Ativa em "onde guardo a senha", "credenciais do robô", "o portal pede MFA",
  "certificado digital", "captcha", "commitei uma senha", "o cliente mandou a senha por chat".
  Ensina onde o segredo mora (nunca no repositório, nunca no artefato da automação), como o código
  o consome sem imprimi-lo, e onde traçar a fronteira do que NÃO se automatiza — a decisão que mais
  evita acesso queimado e conversa difícil com segurança.
---

# Credenciais e a fronteira do humano

Automação de portal vive de credencial: usuário, senha, token, certificado. Duas perguntas decidem
se o projeto é defensável numa auditoria: **onde o segredo mora** e **até onde a automação vai**.

## As duas regras que fazem esta skill valer a pena

> **1. Segredo não entra no repositório nem no artefato da automação.** Ele mora num arquivo fora
> do repo, na máquina que executa, com dono e permissão.
>
> **2. Autenticação que exige presença humana (MFA, biometria, token físico) não se automatiza.**
> Leve a automação até a porta e passe a bola. Tentar contornar queima acesso e vira incidente.

---

## 1. Onde o segredo mora

```
C:\<projeto>-cred\credenciais.json      <- fora do repo, fora do artefato, fora do backup do git
```

O formato importa menos que as três propriedades:

- **Fora do repo** — e portanto imune a `git push` distraído, a clone do colega, a export do robô.
- **Fora do artefato da automação** — não dentro do `robot.db`, não numa variável do Studio, não
  numa etapa do fluxo. Artefato é transportado, exportado, compartilhado; segredo não pode viajar
  junto.
- **Sobrevive ao deploy** — está fora do diretório que o `git reset --hard` limpa. Mesmo motivo
  pelo qual `dev.json` e contadores ficam gitignored.

No repositório entra apenas um **`credenciais.example.json`** com a forma e nenhum valor. Isso
documenta o contrato sem vazar nada, e faz o erro "faltou credencial" aparecer na hora certa.

```jsonc
{
  "token_captcha": "",
  "contas": [
    { "id": "unidade-01", "usuario": "", "senha": "", "documento": "" }
  ]
}
```

**Nos `.gitignore` do projeto**, negue por padrão e libere o exemplo:
```gitignore
*cred*
*credenciais*
*.pfx
*.p12
*.pem
.env
!*.example.json
```

---

## 2. Como o código consome sem vazar

Três hábitos que custam nada e evitam o vazamento mais comum — o **log**:

```python
cred = json.load(open(CAMINHO))
conta = cred["contas"][i]
print(f"conta {conta['id']} | usuario={conta['usuario']} | senha carregada (len {len(conta['senha'])})")
```

- **Nunca imprima o valor.** Imprima que carregou e o tamanho — isso já depura 90% dos casos
  ("carregou vazio?", "veio com espaço no fim?").
- **Nunca passe segredo por linha de comando.** Argumento aparece na lista de processos e no
  histórico do shell. Passe o **índice/identificador da conta**, e o programa lê o arquivo.
- **Screenshot é vazamento em potencial.** Um `shot` depois de preencher o formulário captura o
  campo. Prefira capturar **antes** do preenchimento, ou depois da navegação — e trate a pasta de
  capturas como material sensível.

---

## 3. A fronteira: o que fica com o humano

| Etapa | Quem faz | Por quê |
|---|---|---|
| Abrir o navegador na página de login | automação | não tem segredo envolvido |
| MFA por app com biometria, token físico, certificado em cartão | **humano** | por construção, exige presença. Automatizar seria burlar o controle |
| Usuário + senha de portal comum | automação, com o segredo lido do arquivo | é o caso normal |
| Captcha de imagem | serviço de resolução, **com retry** | não é 100%: erra e precisa de nova tentativa. Trate falha como caminho normal, não como exceção |
| Aprovar prompt de elevação no servidor | **humano** | ver `remote-session-control` |

Escreva essa fronteira no runbook do projeto. Ela é a resposta pronta para "por que o robô não roda
sozinho de ponta a ponta?" — e é uma resposta boa: **porque o controle de acesso está funcionando.**

O custo operacional disso é real e precisa ser dito ao cliente: a sessão aberta pelo humano **expira**
(tipicamente 30–60 min), e a automação para junto. Planeje trabalho em blocos que cabem numa sessão,
com retomada por log (`automation-test-loop`), em vez de prometer um run de 6 horas que ninguém
consegue sustentar.

---

## 4. Se um segredo vazou

Ordem importa — trocar primeiro, limpar depois:

1. **Rotacione a credencial.** Ela está comprometida a partir do commit; limpar o git não
   desfaz o que já foi clonado, espelhado ou indexado.
2. Remova do histórico (`git filter-repo` ou equivalente) e force o push, avisando quem tem clone.
3. Adicione ao `.gitignore` e crie o `.example`.
4. Registre no runbook o que aconteceu. Vale mais como prevenção do que qualquer regra escrita.

Prevenção barata: um hook de pre-commit que recusa arquivos com nome suspeito (`*cred*`, `*.pfx`,
`.env`) e strings de alta entropia em arquivos versionados.

---

## 5. Quando profissionalizar

Arquivo local com permissão é o **suficiente para piloto**, e é honesto reconhecer que é um degrau,
não o destino. Os próximos degraus, em ordem de custo:

1. **Variável de ambiente** por serviço/usuário do SO — tira o arquivo do disco compartilhado.
2. **Cofre do sistema operacional** (Credential Manager / libsecret) — some do sistema de arquivos.
3. **Cofre corporativo / PAM** — se a empresa já tem um broker de acesso privilegiado (é o mesmo que
   publica a sessão remota), ele provavelmente também guarda segredo de aplicação. Usar o que já
   existe é mais rápido de aprovar do que introduzir ferramenta nova.

Escolha o degrau na conversa com segurança, não sozinho — e deixe registrado qual degrau o projeto
está e por quê.
