# 133 — Review findings

The language review of task 10 (owner, 2026-10-27): eight reviewer agents, one per language and part, each set up as a native-level technical editor of pt-BR or fr-CA who did not write the drafts, with one brief and the guide ([REVIEW-GUIDE.md](./REVIEW-GUIDE.md)). Each then applied its own findings under fixed rules: meaning, wrong and typography applied unless they break ICU or the glossary; awkward applied only when clearly better and not much longer for a label; glossary questions to the owner. Statuses: **done** (applied as suggested), **changed** (applied differently, the note says how), **kept** (not applied, the note says why).

It is a model reading a model's drafts: it catches wrong meaning, grammar, register, typography and inconsistency, not reliably what only a native speaker hears. A read by native speakers stays possible with the same kit.

**Owner decisions (2026-10-27):** two-factor sign-in is "autenticação de dois fatores" / « double authentification » everywhere (the glossary changed to follow the screens in Portuguese, the screens changed to follow the glossary in French); French « révision » stays for both the review and a numbered round, and the sentences where the two clash are reworded.

**Totals:** 407 findings: 367 done, 29 changed, 11 kept.

## Portuguese (pt-BR): the most-seen screens

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| pt-A-1 | GLOSSARY.md: two-factor sign-in | glossary | login em dois fatores | autenticação de dois fatores | done | The owner decided on "autenticação de dois fatores", which every message in batch A already says; no message change was needed (the glossary itself is the owner's). |
| pt-A-2 | auth:device.title (also auth:device.metaTitle) | meaning | Entrar no rmk | Conectar o rmk | done | auth:device.title and auth:device.metaTitle are now "Conectar o rmk". |
| pt-A-3 | account:tokens.created_panel.signIn | meaning | Entre no rmk com ele | Conecte o rmk com ele | done |  |
| pt-A-4 | item:overview.install.quickFlags | meaning | Atalhos | Opções rápidas | done |  |
| pt-A-5 | auth:signIn.sso.disabled (also auth:signIn.sso.not_allowed) | wrong | Peça ao root para adicioná-lo, ou para permitir o domínio do seu e-mail. | Peça ao root para adicionar a sua conta ou permitir o domínio do seu e-mail. | done | Changed in both auth:signIn.sso.disabled and auth:signIn.sso.not_allowed. |
| pt-A-6 | account:password.changed | wrong | Você continua conectado aqui; as outras sessões foram encerradas. | Sua sessão continua ativa aqui; as outras foram encerradas. | done |  |
| pt-A-7 | account:security.errors.not_signed_in | wrong | Você foi desconectado. Entre de novo. | Sua sessão foi encerrada. Entre de novo. | done |  |
| pt-A-8 | auth:signIn.errors.invalid_credentials (also auth:twoFactor.errors.refused) | wrong | O e-mail ou a senha está errado | E-mail ou senha incorretos | done | Changed in both auth:signIn.errors.invalid_credentials and auth:twoFactor.errors.refused. |
| pt-A-9 | account:security.backup.manual | wrong | Selecionado: copie-os | Selecionados: copie-os | done |  |
| pt-A-10 | item:overview.dependencies.loading | wrong | Carregando o diagrama… | Carregando o canvas… | done |  |
| pt-A-11 | home:gettingStarted.noScope.text | wrong | para que as pessoas possam enviar itens | para que as pessoas possam submeter itens | done |  |
| pt-A-12 | account:tokens.status | wrong | Situação | Status | changed | account:tokens.status stays "Situação", the word admin.json uses five times; instead feedback:admin.columns.status became "Situação" and feedback:admin.filters.anyStatus became "Qualquer situação". |
| pt-A-13 | feedback:done | wrong | Concluir | Concluído | kept | "Concluir" is the usual "Done" button in admin.json and author.json (10 times), so feedback is not the odd one out across the app; whether to standardise Done buttons app-wide is the owner's call. |
| pt-A-14 | home:recent.seeAll | wrong | Ver tudo | Ver todos | done |  |
| pt-A-15 | auth:signIn.forgotNote | wrong | Se você é o único root, execute | Se você for o único root, execute | done |  |
| pt-A-16 | auth:signIn.forgotNote | awkward | Um autenticador perdido, e os seus códigos de backup, é redefinido do mesmo jeito: por um root, ou, para o único root, por esse comando. | Se você perder o autenticador e os códigos de backup, a redefinição é feita do mesmo jeito: por um root ou, se você for o único root, por esse comando. | done |  |
| pt-A-17 | common:cliAuth.webHint | awkward | Tem conta pela sua empresa, ou usa a autenticação de dois fatores? Aprove no navegador: | Entra com o login da sua empresa ou usa a autenticação de dois fatores? Aprove pelo navegador: | done |  |
| pt-A-18 | auth:twoFactor.subtitle | awkward | Agora o código do seu celular. | Agora digite o código do seu celular. | done |  |
| pt-A-19 | home:gettingStarted.setUp.text | awkward | Isto some na sua próxima visita; você pode trazê-lo de volta em Conta quando quiser. | Este painel some na sua próxima visita; você pode trazê-lo de volta em Conta quando quiser. | done |  |
| pt-A-20 | account:gettingStarted.description | awkward | Ela continua de onde você está: o que você já fez continua marcado. | Ela retoma de onde você parou: o que você já fez continua marcado. | done |  |
| pt-A-21 | account:header.description | awkward | Cada alteração fica registrada no registro de auditoria. | Cada alteração fica gravada no registro de auditoria. | done |  |
| pt-A-22 | account:password.intro | awkward | Os outros navegadores e dispositivos são desconectados quando ela muda. | Ao alterar a senha, os outros navegadores e dispositivos são desconectados. | done |  |
| pt-A-23 | account:password.required.body | awkward | o resto do Ronne abre depois disso | o restante do Ronne fica disponível depois disso | done |  |
| pt-A-24 | account:security.required.body | awkward | O resto do Ronne abre quando ela estiver ativa. | O restante do Ronne fica disponível quando ela estiver ativa. | done |  |
| pt-A-25 | account:language.hint | awkward | Automático segue o seu navegador, e o inglês quando ele pede outro idioma. | No modo automático, usa o idioma do navegador, ou o inglês se o navegador pedir um idioma que não está disponível. | done | It is a hint, not a label, so the length rule does not apply. |
| pt-A-26 | account:security.setup.start | awkward | Configurar a autenticação de dois fatores | Configurar | done |  |
| pt-A-27 | account:security.manage.turnOff (also account:security.manage.turnOffLabel) | awkward | Desativar a autenticação de dois fatores | Desativar | changed | Only the button (account:security.manage.turnOff) is now "Desativar"; turnOffLabel is the section's heading and keeps the full name. |
| pt-A-28 | item:overview.files.unreadableBody | awkward | O pacote dela não está no armazenamento | O pacote desta versão não está no armazenamento | done |  |
| pt-A-29 | item:tools.level.degraded | awkward | em parte | parcial | done |  |
| pt-A-30 | item:tools.degraded | awkward | com parte dele de fora: a página da ferramenta diz o quê. | mas sem algumas partes: a página da ferramenta diz quais. | done |  |
| pt-A-31 | item:tools.none | awkward | então o rmk os ignora ali com um aviso. | então o rmk o ignora nessa ferramenta, com um aviso. | done |  |
| pt-A-32 | item:overview.document.binary | awkward | Um arquivo binário. Arquivos o lista. | Um arquivo binário. Ele aparece em Arquivos. | done |  |
| pt-A-33 | item:overview.document.tooLarge | awkward | Grande demais para mostrar aqui. Arquivos o lista. | Grande demais para mostrar aqui. Ele aparece em Arquivos. | done |  |
| pt-A-34 | item:overview.model.risk.executable | awkward | Traz arquivos executáveis | Inclui arquivos executáveis | done |  |
| pt-A-35 | item:overview.model.risk.shell_script | awkward | Traz scripts de shell | Inclui scripts de shell | done |  |
| pt-A-36 | item:overview.model.guard.globs | awkward | Vale só para arquivos que combinam com {globs}. | Vale só para arquivos que correspondem a {globs}. | done |  |
| pt-A-37 | shelves:pin.unpinLabel | awkward | Remover a fixação de {name} de {shelf} | Desafixar {name} de {shelf} | done |  |
| pt-A-38 | feedback:errors.rate_limited | awkward | Tente novamente mais tarde. | Tente de novo mais tarde. | done |  |
| pt-A-39 | auth:signIn.subtitleBoth | typography | Use o login da sua empresa, ou o seu e-mail e senha | Use o login da sua empresa ou o seu e-mail e senha | done | Also removed the comma before "ou" in account:security.setup.step2, account:security.manage.code and account:tokens.empty. |

## Portuguese (pt-BR): authoring and errors

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| pt-B-1 | author:form.asOfSave | meaning | Desde o último salvamento: | Conforme o último salvamento: | done |  |
| pt-B-2 | author:why.together | meaning | (lançadas juntas com {names}: nenhuma foi.) | (lançamento conjunto com {names}: nenhuma foi lançada.) | done |  |
| pt-B-3 | author:review.changesTo | meaning | Alterações da {version} | Alterações em relação à {version} | done |  |
| pt-B-4 | workspaces:request.requested | wrong | Solicitado em <date></date> | Solicitada em <date></date> | done |  |
| pt-B-5 | workspaces:request.declined | wrong | Recusado em <date></date> | Recusada em <date></date> | done |  |
| pt-B-6 | workspaces:request.declinedAgain | wrong | Recusado em <date></date>; peça | Recusada em <date></date>; peça | done |  |
| pt-B-7 | author:queue.yours | wrong | seu | sua | done | queue.yours "seu" → "sua" (only the queue key; the other "seu" keys refer to items or drafts) |
| pt-B-8 | errors:InvalidGroupMappingError | wrong | exatamente como o provedor os envia | exatamente como o provedor o envia | done |  |
| pt-B-9 | errors:InvalidWorkspaceNameError | typography | Use só letras minúsculas, dígitos e hífens. | Use só letras minúsculas, dígitos e hifens. | done |  |
| pt-B-10 | types:group.bundles | wrong | Pacotes | Bundles | done | "Bundles" passes the untranslated and English-words tests |
| pt-B-11 | author:form.toolHint | wrong | de um MCP server | de um servidor MCP | done |  |
| pt-B-12 | errors:InvalidNameError, errors:InvalidProviderNameError | awkward | O nome exibido | O nome de exibição | done | Both keys changed the same way |
| pt-B-13 | errors:ProviderNotTestedError | awkward | Rode o Testar login você mesmo e passe nele antes de ligar este provedor. | Execute você mesmo o Testar login, com sucesso, antes de ativar este provedor. | changed | "Execute pessoalmente o Testar login…" instead of "você mesmo": neutral for the reader (i18n.md Typography), as pt-C-18. |
| pt-B-14 | errors:ScimOffError | awkward | Ligue primeiro o SCIM deste provedor. | Ative primeiro o SCIM deste provedor. | done |  |
| pt-B-15 | errors:NoUsableProviderError | awkward | Antes, ligue um provedor de identidade | Antes, ative um provedor de identidade | done |  |
| pt-B-16 | errors:InvalidProviderIdError | awkward | e não é credential | e não pode ser credential | done |  |
| pt-B-17 | errors:DependencyNotVisibleError | awkward | só os itens dele podem depender dele | só os itens desse espaço de trabalho podem depender dele | done |  |
| pt-B-18 | errors:BulkLimitError | awkward | uma solicitação aceita no máximo {limit} | uma única operação aceita no máximo {limit} | done |  |
| pt-B-19 | author:editor.importHint | awkward | Uma única pasta de topo é desembrulhada. | Se houver uma única pasta no topo, o conteúdo dela é extraído. | done |  |
| pt-B-20 | author:editor.importHint | awkward | e aí nada muda | e nada é alterado | done |  |
| pt-B-21 | author:release.together | awkward | um grupo que falha para só a si mesmo | a falha de um grupo interrompe só esse grupo | done |  |
| pt-B-22 | author:review.publish.withMany | awkward | Lançados junto, estes {count, number}: | Lançados junto ({count, number}): | done |  |
| pt-B-23 | author:versions.yankHint | awkward | Se a latest aponta para ela, a latest volta. | Se a latest apontar para ela, a latest volta para a versão anterior. | done |  |
| pt-B-24 | author:editor.readOnlyText.notMember | awkward | os moderadores ainda podem decidi-lo | os moderadores ainda podem tomar uma decisão sobre ele | done |  |
| pt-B-25 | workspaces:requests.movesIntro | awkward | Aprovar confere a movimentação de novo e a faz. | Aprovar verifica a movimentação de novo e a executa. | changed | Applied as suggested, and also changed "um espaço que você administra" to "um espaço de trabalho que você administra" (the glossary point given in the reason) |
| pt-B-26 | workspaces:moves.refuses | awkward | {count, plural, one {# coisa a impede agora: Aprovar lista.} other {# coisas a impedem agora: Aprovar lista.}} | {count, plural, one {# motivo impede isso agora: Aprovar mostra qual.} other {# motivos impedem isso agora: Aprovar mostra quais.}} | done |  |
| pt-B-27 | workspaces:moves.approveAria | awkward | Aprovar mover {scope} para {to} | Aprovar a movimentação de {scope} para {to} | done | aria label, not shown on screen, so length is not a concern |
| pt-B-28 | workspaces:moves.declineAria | awkward | Recusar mover {scope} para {to} | Recusar a movimentação de {scope} para {to} | done |  |
| pt-B-29 | workspaces:moves.declineBody | awkward | Recusar mover <mono>{scope}</mono> para <mono>{to}</mono>? | Recusar a movimentação de <mono>{scope}</mono> para <mono>{to}</mono>? | done |  |
| pt-B-30 | workspaces:requests.answer | awkward | Responder | Resposta | done |  |
| pt-B-31 | workspaces:list.otherIntro | awkward | Você vê um espaço de trabalho aqui quando entrar nele. | Você verá um espaço de trabalho aqui quando entrar nele. | done |  |
| pt-B-32 | types:description.rule | awkward | para arquivos que combinam | para arquivos correspondentes | done |  |

## Portuguese (pt-BR): admin and help

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| pt-C-1 | admin:workspaces.dialogs.rename.items | wrong | {count, plural, one {O # item} other {Os # itens}} será renomeado de | {count, plural, one {O # item será renomeado} other {Os # itens serão renomeados}} de | done |  |
| pt-C-2 | help:favorites.answer | meaning | Só você a vê, o root inclusive | Só você a vê: nem o root tem acesso a ela | done |  |
| pt-C-3 | help:scope.answer | meaning | e a revisão é a porta de entrada | e a revisão é o filtro | done |  |
| pt-C-4 | admin:settings.feeds.sizeBody | meaning | Além disso, o marketplace deixa de carregar | Acima disso, o marketplace deixa de carregar | done |  |
| pt-C-5 | admin:passwordChange.askedDone | meaning | A pessoa será convidada a escolher uma nova senha no próximo acesso. | A pessoa terá de escolher uma nova senha no próximo acesso. | done | Also clearBody and clearedDone: "A pessoa não precisará mais escolher uma nova senha." |
| pt-C-6 | admin:workspaces.dialogs.visibility.dependentsBody | wrong | Eles deixariam de instalar. Publique-os sem essa dependência antes. | Eles deixariam de poder ser instalados. Lance-os sem essa dependência antes. | done |  |
| pt-C-7 | admin:move.outsideDependents | wrong | Itens publicados fora de {workspace} dependem dos itens dele e deixariam de instalar para quem não vê {workspace}: | Itens lançados fora de {workspace} dependem dos itens dele e deixariam de poder ser instalados por quem não vê {workspace}: | done |  |
| pt-C-8 | admin:workspaces.dialogs.visibility.openBody | wrong | Elas falhariam na publicação. | Elas falhariam no lançamento. | done |  |
| pt-C-9 | admin:move.openDependents | wrong | falharão na publicação: | falharão no lançamento: | done |  |
| pt-C-10 | admin:settings.feeds.timeBody | wrong | então só a primeira requisição depois de uma publicação espera tanto | então só a primeira requisição depois de um lançamento espera tanto | done |  |
| pt-C-11 | admin:setup.root.helpAnswer | wrong | revisar e publicar itens e passar por cima de uma decisão | revisar e lançar itens e aprovar por exceção | changed | "revisar e lançar itens e abrir uma exceção a uma decisão": the override is a general decision here, so "aprovar por exceção" was too narrow. |
| pt-C-12 | help:visibility.answer | wrong | enquanto itens publicados de fora dependerem dos itens dele | enquanto itens lançados de fora dependerem dos itens dele | done |  |
| pt-C-13 | admin:audit.sentences.actions.submission.submitted | wrong | Enviou <name>{item}</name>{hasRevision, select, true { para revisão (revisão {revision})} other { para revisão}} | Submeteu <name>{item}</name>{hasRevision, select, true { para revisão (revisão {revision})} other { para revisão}} | done |  |
| pt-C-14 | admin:audit.sentences.actions.submission.resubmitted | wrong | Reenviou | Ressubmeteu | done |  |
| pt-C-15 | admin:move.notMembers | wrong | mas não alterá-lo nem enviá-lo | mas não alterá-lo nem submetê-lo | done |  |
| pt-C-16 | help:token.answer | wrong | e nada é enviado até você fazer isso aqui | e nada é submetido até você fazer isso aqui | done |  |
| pt-C-17 | admin:users.copy.manual | wrong | Selecionado: copie você mesmo | Selecionado: copie manualmente | done | Same text "copie você mesmo" is in common.json (common:copy… "selecionado: copie você mesmo"), outside this batch. |
| pt-C-18 | admin:settings.providerControls.turnOnReason | wrong | Rode o Testar login você mesmo e passe nele | Rode e passe no Testar login por conta própria | changed | "Rode o Testar login pessoalmente e passe nele…": the point is that you run it yourself, which "por conta própria" blurred. errors.json:ProviderNotTestedError has the same "você mesmo", outside this batch. |
| pt-C-19 | help:device-code.answer | wrong | só aprove um código que você mesmo acabou de pedir | só aprove um código que você acabou de pedir | done |  |
| pt-C-20 | admin:settings.twoFactor.coverage | wrong | todas com dois fatores ligado. | todas com o login em dois fatores ligado. | changed | "todas com a autenticação de dois fatores ligada." (owner's two-factor decision). |
| pt-C-21 | admin:settings.providerControls.change.release | wrong | voltaria a usuário em {workspace} | voltaria a ser usuário em {workspace} | done |  |
| pt-C-22 | admin:audit.sentences.parts.ssoReasons.unverified_email | wrong | o provedor não disse que o e-mail é verificado | o provedor não disse que o e-mail está verificado | done |  |
| pt-C-23 | admin:audit.sentences.parts.scimRefusals.missing | wrong | nenhum token de portador | nenhum token Bearer | done |  |
| pt-C-24 | admin:audit.sentences.parts.scimRefusals.expired | wrong | um token além das 24 horas após uma rotação | um token anterior cujas 24 horas após a troca já passaram | done |  |
| pt-C-25 | admin:settings.scim.onBody | wrong | O login dele deixa de aplicar a claim de grupos | O login dele deixa de aplicar o claim de grupos | done | Masculine "o claim" everywhere now (onBody was the only feminine one). |
| pt-C-26 | help:join.answer | wrong | ou pelo link de convite que os moderadores ou admins enviam | ou pelo link para entrar que os moderadores ou admins enviam | done |  |
| pt-C-27 | help:submit-many.answer | wrong | cada um é verificado de novo e submetido por conta própria | cada um é verificado de novo e submetido individualmente | done |  |
| pt-C-28 | help:approve-many.answer | wrong | Cada uma é aprovada por conta própria, como na sua página | Cada uma é aprovada individualmente, como na página dela | done |  |
| pt-C-29 | help:two-factor-policy.question | wrong | Quem precisa se cadastrar? | Quem precisa ativar os dois fatores? | changed | "Quem precisa ativar a autenticação de dois fatores?" (owner's two-factor decision). |
| pt-C-30 | help:scim-provider.question | wrong | O que o provedor precisa? | Do que o provedor precisa? | done |  |
| pt-C-31 | help:waits-on.question | wrong | Pelo que isto aguarda? | O que isto está aguardando? | done |  |
| pt-C-32 | help:audit-summary.answer | wrong | para quem você o compartilhar | com quem você o compartilhar | done |  |
| pt-C-33 | admin:settings.feeds.intro | awkward | como foi construído por completo da última vez | como foi gerado por completo da última vez | done | feeds.intro, timeBody, columns.buildTime ("Tempo de geração"), columns.built ("Gerado"), notBuilt, help:plugin-feeds. |
| pt-C-34 | admin:audit.sentences.actions.version.undeprecated | awkward | Removeu a obsolescência de <name>{item}</name> | Desmarcou <name>{item}</name> como obsoleta | done |  |
| pt-C-35 | admin:audit.sentences.actions.submission.rebased | awkward | Rebaseou <name>{item}</name> | Fez rebase de <name>{item}</name> | done |  |
| pt-C-36 | admin:actions.removeRoot.title | awkward | Remover o root de {email}? | Tirar o papel root de {email}? | done |  |
| pt-C-37 | admin:actions.twoFactorBody | awkward | Para celular perdido e códigos de backup perdidos. | Para quando o celular e os códigos de backup foram perdidos. | done | Together with the two-factor wording in the same message. |
| pt-C-38 | admin:erase.reminder | awkward | entregue antes. | entregue isso a ela antes. | done |  |
| pt-C-39 | admin:audit.sentences.actions.instance.secret_rotated | awkward | então todos entram de novo | então todos precisam entrar de novo | done |  |
| pt-C-40 | admin:audit.sentences.actions.auth.sign_in_failed | awkward | Falha ao entrar para <name>{email}</name> | Falha de login de <name>{email}</name> | done |  |
| pt-C-41 | admin:audit.sentences.actions.auth.sso_failed | awkward | {hasEmail, select, true { para <name>{email}</name>} other {}} | {hasEmail, select, true { de <name>{email}</name>} other {}} | done |  |
| pt-C-42 | admin:audit.sentences.actions.auth.signed_in | awkward | Entrou (lembrado por 30 dias) | Entrou (sessão lembrada por 30 dias) | done |  |
| pt-C-43 | admin:audit.sentences.actions.scope.move_declined | awkward | Recusou mover <name>{scope}</name> | Recusou a movimentação de <name>{scope}</name> | done |  |
| pt-C-44 | admin:audit.filters.actorPlaceholder | typography | E-mail, ou system | E-mail ou system | done |  |
| pt-C-45 | admin:settings.page.description | awkward | fica registrada no registro de auditoria | fica gravada no registro de auditoria | done |  |
| pt-C-46 | admin:settings.providerPage.testNotice.done | awkward | O seu Testar login terminou | O seu teste de login terminou | changed | "O seu teste de login terminou/passou/não passou"; turnOnNeeds rewritten as "Para ligar, você precisa passar no Testar login com as configurações como estão agora." (it keeps the button name because it tells you what to do). |
| pt-C-47 | admin:settings.providerControls.wouldDo | awkward | Um acesso: | Com um login, a pessoa: | done |  |
| pt-C-48 | admin:settings.scim.steps.entra.s2 | awkward | depois Test Connection. | depois clique em Test Connection. | done |  |
| pt-C-49 | admin:settings.feeds.nearTitle | awkward | está perto de {what, select, both {seus limites} size {seu limite de tamanho} other {seu limite de tempo}} | está perto {what, select, both {dos seus limites} size {do seu limite de tamanho} other {do seu limite de tempo}} | done |  |
| pt-C-50 | admin:settings.feeds.timeBody | awkward | depois respondido da memória | depois servido a partir da memória | done |  |
| pt-C-51 | admin:settings.privacy.lastRun.failed | awkward | a próxima execução segue o calendário | a próxima execução acontece no horário previsto | done |  |
| pt-C-52 | admin:setup.unavailable.body | awkward | mas não consegue alcançá-lo | mas não consegue se conectar a ele | done |  |
| pt-C-53 | admin:setup.database.pickAnswer | awkward | um arquivo, cujo backup é copiá-lo | um só arquivo, e o backup é uma cópia dele | done |  |
| pt-C-54 | admin:setup.instance.envDocker | awkward | que vale mais que as configurações | que tem prioridade sobre as configurações | done | Both envDocker and envOther. |
| pt-C-55 | admin:done.users.erased | awkward | nada da pessoa pode ser lido de volta | nada da pessoa pode ser recuperado | done |  |
| pt-C-56 | help:move-approve.answer | awkward | Se algo quebrar agora, nada é movido | Se a movimentação quebrasse algo agora, nada é movido | changed | "Se algo fosse quebrar agora, nada é movido" keeps the original subject. |
| pt-C-57 | help:favorites.answer | awkward | Sua própria lista de itens aos quais voltar | A sua lista de itens para ver depois | done |  |
| pt-C-58 | help:submit-many.answer | awkward | Marque os rascunhos marcados como Pronto | Marque os rascunhos com o status Pronto | done |  |
| pt-C-59 | help:queue-decisions.answer | awkward | Cada linha os tem | Os dois estão em cada linha | done |  |
| pt-C-60 | help:dependents-listed.answer | awkward | Rejeitá-la as deixa aguardando por nada | Se você a rejeitar, elas ficam esperando algo que não vai chegar | done |  |
| pt-C-61 | help:scim-managed.answer | awkward | a próxima sincronização volta o nome, o e-mail e se está ativa ao que o provedor diz | a próxima sincronização restaura o nome, o e-mail e o status (ativa ou não) conforme o provedor | done |  |
| pt-C-62 | help:redirect-uri.answer | awkward | o provedor o devolve a este endereço | o provedor manda a pessoa de volta a este endereço | done |  |
| pt-C-63 | help:password-lockout.question | awkward | O root pode ficar de fora? | O root pode ficar bloqueado? | done |  |
| pt-C-64 | help:own-row.answer | awkward | Para que ninguém se tranque do lado de fora por engano. | Para que ninguém fique sem acesso por engano. | done |  |
| pt-C-65 | help:notice.answer | awkward | escreva no idioma que as suas pessoas leem | escreva no idioma que as pessoas da sua organização leem | done |  |
| pt-C-66 | help:audit-actor.answer | awkward | em qualquer caixa | com maiúsculas ou minúsculas | done |  |

## Portuguese (pt-BR): the website

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| pt-W-1 | www/messages/pt.json:85 | meaning | Registro de IA de código aberto | Registro de código aberto de capacidades de IA | changed | The suggestion made the title 69 characters; it is now "Registro aberto de capacidades de IA" (59): the site's metadata test keeps a title under 60. |
| pt-W-2 | www/messages/pt.json:13 | meaning | Ferramentas para times decidirem o que seus agentes de IA podem fazer, a começar por | A Ronne AI cria ferramentas para times decidirem o que os agentes de IA deles podem fazer, a começar por | changed | Shortened afterwards to 158 characters ("…começando por um registro aberto e auto-hospedado de capacidades de IA"): the site's metadata test keeps a description under 160. |
| pt-W-3 | www/messages/pt.json:63 | wrong | Peça para ser removido a qualquer momento. | Você pode pedir a remoção a qualquer momento. | done |  |
| pt-W-4 | www/messages/pt.json:212 | wrong | Uma versão pode ser depreciada | Uma versão pode ser marcada como obsoleta | changed | Also fixed :379 ("a obsolescência"), :438 and :614 (where the agreement became "marcados como obsoletos"). |
| pt-W-5 | www/messages/pt.json:212 | wrong | mostram um diff contra uma versão base | mostram um diff em relação a uma versão base | changed | Also fixed :614, as "em relação à própria versão base". |
| pt-W-6 | www/messages/pt.json:212 | wrong | pré-releases ficam em | os pré-lançamentos ficam em | changed | Written "os pré-lançamentos", with the article. |
| pt-W-7 | www/messages/pt.json:200 | wrong | Mudanças podem ser pedidas e o item reenviado. | Alterações podem ser solicitadas e o item, reenviado. | done | Also fixed :434 and :584 as suggested. |
| pt-W-8 | www/messages/pt.json:211 | wrong | Mudanças pedidas | Alterações solicitadas | done |  |
| pt-W-9 | www/messages/pt.json:111 | wrong | a faixa de versões de cada um | o intervalo de versões de cada um | done | Also fixed :335, :430 and :595 ("o seu intervalo de versões" at :335). |
| pt-W-10 | www/messages/pt.json:470 | wrong | Login em duas etapas | Autenticação de dois fatores | done | Owner's decision: all five places now say "autenticação de dois fatores" (:342 has "autenticação de dois fatores desligada"). Also changed settings.tsx:48, where the bold label "Login em dois fatores" is now "Autenticação de dois fatores": the app's admin.json:779 still says "Login em dois fatores", so the admin batch must change it to match. |
| pt-W-11 | www/messages/pt.json:459 | awkward | não tranca todo mundo do lado de fora | não deixa todo mundo sem acesso | done | Also fixed :541 and password-sign-in.tsx:61. |
| pt-W-12 | www/messages/pt.json:484 | awkward | O servidor limpa o que é mais antigo em um agendamento. | O servidor limpa periodicamente o que é mais antigo. | changed | Written "O servidor limpa periodicamente o que é mais antigo." Also fixed :545 ("faz periodicamente a limpeza"). |
| pt-W-13 | www/messages/pt.json:268 | awkward | Código aberto, no começo | Código aberto, em fase inicial | done | The title is 30 characters, against 24 before (1.25 times). |
| pt-W-14 | www/messages/pt.json:414 | wrong | aos quais você pode pedir para entrar | nos quais você pode pedir para entrar | done |  |
| pt-W-15 | www/messages/pt.json:463 | wrong | com passos para cada modelo | com passos para cada preset | done |  |
| pt-W-16 | www/messages/pt.json:346 | wrong | o endereço base | a URL base | done |  |
| pt-W-17 | www/messages/pt.json:564 | awkward | Um item recua para versões mais antigas | Um item volta a usar versões mais antigas | done |  |
| pt-W-18 | www/messages/pt.json:571 | awkward | nem formar um círculo | nem formar um ciclo | done |  |
| pt-W-19 | www/src/content/docs/pt/start-here.tsx:11 | awkward | A prateleira no Início de todo mundo que o root preenche | A prateleira que o root preenche, no Início de todo mundo, | done | Also fixed the body sentence at :18. |
| pt-W-20 | www/src/content/docs/pt/start-here.tsx:26 | wrong | o botão fica desligado e diz por quê | o botão fica desativado e diz por quê | changed | Also fixed privacy.tsx:172, as "antes de ativar o Apagar". |
| pt-W-21 | www/src/content/docs/pt/overview.tsx:168 | awkward | quem é novo, e não ocultou, vê | quem é novo e não ocultou o banner vê | done |  |
| pt-W-22 | www/src/content/docs/pt/overview.tsx:196 | awkward | Ele não segura o resto. | Ele não impede os outros passos. | done |  |
| pt-W-23 | www/src/content/docs/pt/overview.tsx:202 | awkward | o <strong>✕</strong> oculta. | o <strong>✕</strong> oculta o banner. | done |  |
| pt-W-24 | www/src/content/docs/pt/authentication.tsx:165 | awkward | Mudar depois o issuer, o client, o secret ou os scopes | Mudar depois o issuer, o client ID, o client secret ou os scopes | done | Also fixed :172 ("o client secret dele"). |
| pt-W-25 | www/src/content/docs/pt/authentication.tsx:221 | awkward | um grupo pode subir o papel user simples | um grupo pode elevar o papel user simples | done | Also fixed :217 ("nem para elevá-la"). |
| pt-W-26 | www/src/content/docs/pt/backups.tsx:67 | wrong | frase-senha | frase secreta | done | Fixed backups.tsx :67 and :69, and security.tsx:127. |
| pt-W-27 | www/src/content/docs/pt/backups.tsx:32 | awkward | num só arquivo. | num só arquivo compactado. | done |  |
| pt-W-28 | www/src/content/docs/pt/backups.tsx:82 | awkward | <strong>Num agendamento:</strong> o Ronne não tem um próprio; | <strong>Agendado:</strong> o Ronne não tem agendador próprio; | done |  |
| pt-W-29 | www/src/content/docs/pt/backups.tsx:134 | awkward | tire os dados do caminho dentro do | mova os dados atuais para outra pasta dentro do | done | Also fixed mcp.tsx:207 and rmk.tsx:401 ("mova-os para outro lugar"). |
| pt-W-30 | www/src/content/docs/pt/backups.tsx:147 | awkward | o jeito de mudar uma instância | o jeito de migrar uma instância | done |  |
| pt-W-31 | www/src/content/docs/pt/cursor.tsx:62 | awkward | Cursor deixa skills, comandos e hooks para a cópia do Claude Code em vez de gravar uma | Cursor usa a cópia do Claude Code para skills, comandos e hooks em vez de gravar uma | done |  |
| pt-W-32 | www/src/content/docs/pt/incidents.tsx:103 | wrong | a senha e o configura de novo. | a senha e a configura de novo. | done |  |
| pt-W-33 | www/src/content/docs/pt/install.tsx:416 | awkward | o <Code>rmk-server service</Code> recusa no Windows | o <Code>rmk-server service</Code> se recusa a rodar no Windows | done |  |
| pt-W-34 | www/src/content/docs/pt/install.tsx:535 | wrong | dela (para um celular perdido, e avisa que fez isso) | dele (para um celular perdido, e avisa que fez isso) | done |  |
| pt-W-35 | www/src/content/docs/pt/install.tsx:120 | wrong | "empty", | "vazio", | changed | Three cells said "empty", not two: RONNE_DOMAIN, RONNE_ACME_EMAIL and RONNE_TRUSTED_PROXIES. All three now say "vazio", and the PUBLIC_URL default says "ou". |
| pt-W-36 | www/src/content/docs/pt/items.tsx:24 | wrong | Um prompt reutilizável ou um slash command, com argumentos. | Um prompt reutilizável ou um comando de barra, com argumentos. | done |  |
| pt-W-37 | www/src/content/docs/pt/items.tsx:231 | wrong | intervalo digitado à mão é gravada | intervalo digitado à mão é gravado | done |  |
| pt-W-38 | www/src/content/docs/pt/items.tsx:266 | wrong | quem pediu cada uma, conforme as versões mais novas as | quem pediu cada um, conforme as versões mais novas os | done |  |
| pt-W-39 | www/src/content/docs/pt/items.tsx:269 | wrong | que atenda às duas. | que atenda aos dois. | done |  |
| pt-W-40 | www/src/content/docs/pt/items.tsx:442 | awkward | os dois primeiros cards | os dois primeiros cartões | changed | Also fixed items.tsx:444 ("um cartão"), rmk.tsx:439 and usage.tsx:196. |
| pt-W-41 | www/src/content/docs/pt/logs.tsx:117 | awkward | Outra execução segura o bloqueio da tarefa | Outra execução detém o bloqueio da tarefa | done | Also fixed privacy.tsx:135. |
| pt-W-42 | www/src/content/docs/pt/mcp.tsx:35 | awkward | e do que mais nada precisa. | e das dependências de que nenhum outro item precisa. | done |  |
| pt-W-43 | www/src/content/docs/pt/notice.tsx:22 | awkward | A página de entrada não o mostra. | A página de login não o mostra. | done |  |
| pt-W-44 | www/src/content/docs/pt/notice.tsx:55 | awkward | no idioma que as suas | no idioma que o seu time lê (and drop "pessoas leem" on line 56) | done |  |
| pt-W-45 | www/src/content/docs/pt/privacy.tsx:16 | awkward | Logins falhados (eventos de auditoria) | Logins que falharam (eventos de auditoria) | done |  |
| pt-W-46 | www/src/content/docs/pt/privacy.tsx:62 | awkward | o GDPR esperam de limites de retenção. | o GDPR esperam em matéria de retenção. | done |  |
| pt-W-47 | www/src/content/docs/pt/privacy.tsx:191 | wrong | O registro do registry fica inteiro | O histórico do registro fica inteiro | done |  |
| pt-W-48 | www/src/content/docs/pt/privacy.tsx:204 | wrong | (root pode gerar o arquivo | (o root pode gerar o arquivo | done | Fixed all five places in privacy.tsx (:204, :302, :306, :309 and :318). |
| pt-W-49 | www/src/content/docs/pt/privacy.tsx:213 | wrong | desatribua a pessoa no provedor | remova a atribuição da pessoa no provedor | done | Fixed privacy.tsx:213 and scim.tsx:139. |
| pt-W-50 | www/src/content/docs/pt/privacy.tsx:265 | wrong | <strong>Workspaces</strong> de que você faz parte | <strong>Espaços de trabalho</strong> de que você faz parte | done |  |
| pt-W-51 | www/src/content/docs/pt/rmk.tsx:452 | meaning | que o root pode ler; os arquivos não. | que o root pode ler; os arquivos não são registrados. | done |  |
| pt-W-52 | www/src/content/docs/pt/roles.tsx:16 | wrong | Propor uma mudança em um item publicado | Propor uma alteração em um item publicado | done |  |
| pt-W-53 | www/src/content/docs/pt/roles.tsx:30 | wrong | (override, auditada) | (exceção, auditada) | done | Also fixed security.tsx:29. |
| pt-W-54 | www/src/content/docs/pt/roles.tsx:54 | awkward | alguém pode comandar o espaço de trabalho do seu time como admin | alguém pode gerir o espaço de trabalho do seu time como admin | changed | Used "gerenciar", the Brazilian word that the glossary uses for Manage, instead of the suggested "gerir", which reads as European Portuguese. Fixed roles.tsx :54 and :70, and workspaces.tsx :347 and :373. |
| pt-W-55 | www/src/content/docs/pt/scim.tsx:85 | awkward | <strong>Ligar o SCIM</strong> e confirme. | Escolha <strong>Ligar o SCIM</strong> e confirme. | done |  |
| pt-W-56 | www/src/content/docs/pt/workspaces.tsx:49 | wrong | os Filters do | os Filtros do | done |  |

## French (fr-CA): the most-seen screens

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| fr-A-1 | auth:twoFactor.title, auth:twoFactor.metaTitle, auth:twoFactor.lost, auth:twoFactor.errors.unreadable, auth:signIn.again.expired, common:cliAuth.webHint, account:tabs.security, account:security.* (every message with this phrase, about 40 in fr) | wrong | connexion à deux facteurs | double authentification | done | « connexion à deux facteurs » is now « double authentification » in common, auth and account (16 messages plus common:cliAuth.webHint). Titles became « Double authentification ». auth:twoFactor.errors.unreadable became « Votre configuration de double authentification ne peut pas être lue… » so the sentence still reads well. |
| fr-A-2 | common:cliAuth.webHint | meaning | Inscrit par votre entreprise, ou vous utilisez la connexion à deux facteurs? | Vous vous connectez par votre entreprise ou utilisez la double authentification? | done |  |
| fr-A-3 | home:waiting.changes | meaning | {count, plural, one {# de vos soumissions demande} other {# de vos soumissions demandent}} des modifications. | {count, plural, one {# de vos soumissions nécessite} other {# de vos soumissions nécessitent}} des modifications. | done |  |
| fr-A-4 | item:notice.title | meaning | pas la plus récente ({target}) | pas celle de l’étiquette latest ({target}) | done |  |
| fr-A-5 | item:notice.show | meaning | Afficher la plus récente | Afficher la version latest | done |  |
| fr-A-6 | item:overview.install.quickFlags | wrong | Raccourcis | Options rapides | done |  |
| fr-A-7 | item:overview.stats.installsDetail | wrong | {removed, number} retirées | {removed, number} désinstallations | done |  |
| fr-A-8 | item:overview.usage.removalsCol | wrong | Retraits | Désinstallations | done |  |
| fr-A-9 | item:overview.dependencies.loading | wrong | Chargement du diagramme… | Chargement du canevas… | done |  |
| fr-A-10 | item:overview.usage.trigger.ci | wrong | En CI | En IC | done |  |
| fr-A-11 | account:security.panel.offIntro | wrong | de sorte qu’un mot de passe volé ne suffit pas | de sorte qu’un mot de passe volé ne suffise pas | done |  |
| fr-A-12 | account:security.backup.manual | wrong | Sélectionné : copiez-les | Sélectionnés : copiez-les | done |  |
| fr-A-13 | shelves:manage.unavailableHint | wrong | il revient quand il en aura une | il reviendra quand il en aura une | done |  |
| fr-A-14 | auth:device.askedAt | wrong | Demandé à | Heure de la demande | changed | Used « Demandé le » instead of « Heure de la demande »: the field is a dt followed by a timestamp, and « Demandé le » stays as short as the original. |
| fr-A-15 | common:cliAuth.step3Hint | wrong | une fois connecté | une fois la connexion établie | done |  |
| fr-A-16 | auth:signIn.sso.unverified_email | wrong | vous n’avez donc pas été connecté | la connexion a donc été refusée | done |  |
| fr-A-17 | auth:signIn.sso.invalid_response | wrong | vous n’avez donc pas été connecté | la connexion a donc été refusée | done |  |
| fr-A-18 | account:password.changed | wrong | Vous restez connecté ici; | Votre session reste ouverte ici; | done |  |
| fr-A-19 | account:password.required.body | wrong | Un administrateur a défini le mot de passe avec lequel vous vous êtes connecté. Remplacez-le par un mot de passe que vous seul connaissez; | Un administrateur a défini le mot de passe utilisé pour cette connexion. Remplacez-le par un mot de passe connu de vous seulement; | done |  |
| fr-A-20 | account:password.required.body | wrong | Utilisez le mot de passe avec lequel vous vous êtes connecté comme mot de passe actuel. | Comme mot de passe actuel, utilisez celui qui vous a servi à vous connecter. | done |  |
| fr-A-21 | account:password.errors.same_password | wrong | celui avec lequel vous vous êtes connecté | celui qui vous a servi à vous connecter | done |  |
| fr-A-22 | account:security.errors.not_signed_in | wrong | Vous avez été déconnecté. | Votre session a été fermée. | done |  |
| fr-A-23 | auth:signIn.forgotNote | wrong | Si vous êtes le seul root | Si vous êtes l’unique root | done |  |
| fr-A-24 | feedback:admin.description | wrong | Seul le root les voit. | Seul root les voit. | done |  |
| fr-A-25 | feedback:admin.errors.forbidden | wrong | Seul le root peut faire cela. | Seul root peut faire cela. | done |  |
| fr-A-26 | item:overview.model.risk.permission_policy | wrong | Modifie les permissions | Modifie les autorisations | done |  |
| fr-A-27 | item:risks.none | wrong | règle de permission | règle d’autorisation | done |  |
| fr-A-28 | shell:footer.openSource | awkward | source ouverte (MIT) | code source ouvert (MIT) | done |  |
| fr-A-29 | shell:sidebar.unfold | awkward | Agrandir la barre latérale | Développer la barre latérale | done |  |
| fr-A-30 | common:notFound.message | awkward | Elle a peut-être changé, ou | La page a peut-être été déplacée, ou | done |  |
| fr-A-31 | common:cliAuth.step2Tokens | awkward | ou avec un jeton personnel de <tokens>Jetons d’accès</tokens>. | ou avec un jeton personnel créé dans <tokens>Jetons d’accès</tokens>. | done |  |
| fr-A-32 | common:metadata.description | awkward | Un registre organisé et auto-hébergé | Un registre sélectionné et auto-hébergé | done |  |
| fr-A-33 | auth:twoFactor.subtitle | awkward | Votre mot de passe était bon. Maintenant, le code de votre téléphone. | Votre mot de passe est correct. Saisissez maintenant le code affiché sur votre téléphone. | done |  |
| fr-A-34 | auth:twoFactor.errors.used | awkward | Attendez le suivant de l’application. | Attendez le prochain code de l’application. | done |  |
| fr-A-35 | account:security.errors.used | awkward | Attendez le suivant de l’application. | Attendez le prochain code de l’application. | done |  |
| fr-A-36 | account:data.description | awkward | si vous en avez besoin de plus | s’il vous en faut davantage | done |  |
| fr-A-37 | account:language.hint | awkward | Automatique suit votre navigateur, et l’anglais s’il demande une autre langue. | Automatique suit la langue de votre navigateur, ou utilise l’anglais si cette langue n’est pas offerte. | done |  |
| fr-A-38 | account:tokens.expires | awkward | Expire le | Expiration | done | account:tokens.expires (the column header) is now « Expiration ». |
| fr-A-39 | account:tokens.created_panel.expires | awkward | Expire le | Expiration | kept | The finding was mistaken: account:tokens.created_panel.expires is used in a sentence, « Expire le <date>. », not as a header, so « Expire le » is right there. |
| fr-A-40 | home:gettingStarted.hideLabel | typography | Masquer Pour commencer | Masquer « Pour commencer » | done |  |
| fr-A-41 | account:gettingStarted.description | typography | la liste Pour commencer | la liste « Pour commencer » | done |  |
| fr-A-42 | account:gettingStarted.show | typography | la liste Pour commencer | la liste « Pour commencer » | done |  |
| fr-A-43 | shelves:pin.blockedPrivate | typography | épinglés dans Commencez ici. | épinglés dans « Commencez ici ». | done |  |
| fr-A-44 | shelves:visibility.startHereTitle | typography | épinglé dans Commencez ici} other {# éléments sont épinglés dans Commencez ici} | épinglé dans « Commencez ici »} other {# éléments sont épinglés dans « Commencez ici »} | done | Both plural branches; the ICU syntax is unchanged. |
| fr-A-45 | shelves:visibility.startHereBody | typography | Tout le monde voit Commencez ici, donc | Tout le monde voit « Commencez ici », donc | done |  |
| fr-A-46 | feedback:admin.description | typography | avec Envoyer des commentaires, | avec « Envoyer des commentaires », | done |  |
| fr-A-47 | shelves:pin.unpinLabel | awkward | Retirer l’épingle de {name} de {shelf} | Désépingler {name} de {shelf} | done |  |
| fr-A-48 | feedback:admin.columns.from | awkward | De | Expéditeur | kept | « Expéditeur » would be far more than 1.3 times the length of the « De » column header. |
| fr-A-49 | feedback:admin.detail.from | awkward | De | Expéditeur | kept | Same as 48, for the detail label. |
| fr-A-50 | feedback:where | awkward | Où cela va-t-il? | Où va votre message? | done |  |
| fr-A-51 | item:tools.degraded | awkward | avec une partie laissée de côté : la page de l’outil dit laquelle. | mais une partie est laissée de côté : la page de l’outil précise laquelle. | done |  |
| fr-A-52 | item:overview.document.binary | awkward | Fichiers le liste. | Il figure dans l’onglet Fichiers. | done |  |
| fr-A-53 | item:overview.document.tooLarge | awkward | Fichiers le liste. | Il figure dans l’onglet Fichiers. | done |  |
| fr-A-54 | item:overview.model.role.skill | awkward | entrée de la skill | fichier d’entrée de la skill | changed | Used « fichier d’entrée » instead of « fichier d’entrée de la skill » to stay within 1.3 times the label's length; the skill is already clear from the context. |
| fr-A-55 | item:overview.usage.outcome.error | awkward | Terminée en erreur | Terminée par une erreur | done |  |
| fr-A-56 | item:overview.usage.gap | awkward | là, seules les installations sont comptées. | pour ces outils, seules les installations sont comptées. | done |  |
| fr-A-57 | item:overview.usage.stopped | awkward | Cette instance ne collecte plus l’utilisation; | Cette instance ne collecte plus les données d’utilisation; | done |  |
| fr-A-58 | item:overview.usage.counted | awkward | sur les machines qui rapportent à cette instance; | sur les machines qui transmettent leurs données à cette instance; | done |  |

## French (fr-CA): authoring and errors

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| fr-B-1 | workspaces:moves.refuses | meaning | {count, plural, one {# élément la refuse maintenant : Approuver les liste.} other {# éléments la refusent maintenant : Approuver les liste.}} | {count, plural, one {# obstacle empêche maintenant le déplacement : Approuver les liste.} other {# obstacles empêchent maintenant le déplacement : Approuver les liste.}} | done |  |
| fr-B-2 | errors:InvalidGroupMappingError | meaning | exactement comme le fournisseur les envoie | exactement comme le fournisseur l’envoie | done |  |
| fr-B-3 | author:queue.approve.messageHint | wrong | Une fois approuvée, l’auteur ou un modérateur peut publier chacune. | Une fois approuvée, chacune peut être publiée par son auteur ou un modérateur. | done |  |
| fr-B-4 | author:editor.readOnlyText.selfApproved | wrong | Il est prêt à publier. | Il est prêt à être publié. | done |  |
| fr-B-5 | author:editor.readOnlyText.approved | wrong | Il est prêt à publier, par vous ou par un modérateur. | Il est prêt à être publié, par vous ou par un modérateur. | done |  |
| fr-B-6 | author:review.publish.withMany | wrong | Publiés avec, ces {count, number} : | Publiés en même temps ({count, number}) : | changed | Only the stray comma removed: "Publiés avec ces {count, number} :", consistent with the kept withOne/withLabel labels |
| fr-B-7 | errors:DraftScopeNotFoundError | wrong | Il n’y a pas de portée @{scopeName} que vous pouvez utiliser. | Il n’y a pas de portée @{scopeName} que vous puissiez utiliser. | done |  |
| fr-B-8 | workspaces:request.requested | wrong | Demandé le <date></date> | Demandée le <date></date> | done |  |
| fr-B-9 | workspaces:controls.cancelAria | wrong | Annuler votre demande pour se joindre à {workspace} | Annuler votre demande d’adhésion à {workspace} | done |  |
| fr-B-10 | author:form.toolHint | wrong | pour les outils d’un MCP server | pour les outils d’un serveur MCP | done |  |
| fr-B-11 | types:tag.rule | wrong | orientation | consignes | done |  |
| fr-B-12 | workspaces:page.requests | awkward | Demandes pour se joindre | Demandes d’adhésion | done | Also workspaces:requests.pageTitle (same text) |
| fr-B-13 | errors:BulkLimitError | awkward | Ça fait {count} soumissions; une demande en prend au plus {limit}. | Cela fait {count} soumissions; une requête en accepte au plus {limit}. | done |  |
| fr-B-14 | author:actions.reloadRevision | awkward | elle ne dit pas quelle révision vous avez révisée | elle n’indique pas quelle révision vous avez examinée | done |  |
| fr-B-15 | errors:RevisionChangedError | awkward | vous avez révisé la révision {reviewedLabel} | vous avez examiné la révision {reviewedLabel} | done |  |
| fr-B-16 | author:marks.blockedHint | awkward | ou dépendez d’un autre élément | ou choisissez une autre dépendance | done | Also author:review.dependents.message and errors:DependencyClosedError |
| fr-B-17 | author:marks.waits.changes_requested | awkward | de retour chez son auteur | renvoyé à son auteur | done | Also author:editor.feedback.others → "Il a été renvoyé à son auteur." |
| fr-B-18 | author:editor.submit.goesWith | awkward | Part avec # de vos brouillons : | Accompagné de # de vos brouillons : | done | Both plural branches |
| fr-B-19 | author:submissions.bulk.includedTitle | awkward | il part avec lui | il est soumis avec lui | done |  |
| fr-B-20 | author:why.goes_with | awkward | Elle va avec {name}, qui ne peut pas partir : {why} | Elle est liée à {name}, qui ne peut pas être publié : {why} | done |  |
| fr-B-21 | author:why.too_many | awkward | Elle va avec {others} autres, plus de {most} à la fois | Elle est liée à {others} autres, plus de {most} à la fois | done |  |
| fr-B-22 | author:why.together | awkward | aucune n’est partie. | aucune n’a été publiée. | done |  |
| fr-B-23 | author:why.not_releaser | awkward | Seuls son auteur, un modérateur ou root la publient. | Seuls son auteur, un modérateur ou root peuvent la publier. | done |  |
| fr-B-24 | author:submissions.bulk.selectAll | awkward | Sélectionner tous les prêts | Sélectionner tous ceux qui sont prêts | changed | Button: "Tout sélectionner (prêts) ({count, number})" instead, matching author:release.selectAll and staying short |
| fr-B-25 | author:release.together | awkward | un groupe qui échoue n’arrête que lui-même | l’échec d’un groupe n’arrête que ce groupe | done |  |
| fr-B-26 | author:review.publish.withOne | awkward | Publié avec : | Publié en même temps : | kept | Label: "Publié en même temps :" is over 1.3 times as long; review.publish.withLabel kept too |
| fr-B-27 | author:review.publish.tagHint | awkward | Installer sans version utilise latest. | Une installation sans version utilise latest. | done |  |
| fr-B-28 | author:versions.removeText | awkward | Installer <mono>{install}</mono> cesse de fonctionner. | La commande <mono>{install}</mono> cessera de fonctionner. | done |  |
| fr-B-29 | author:editor.leave | awkward | Si vous partez maintenant, elles sont perdues. | Si vous partez maintenant, elles seront perdues. | done |  |
| fr-B-30 | author:editor.proposal.resolve | awkward | Marquer résolu | Marquer comme résolu | kept | Button: "Marquer comme résolu" is over 1.3 times as long |
| fr-B-31 | author:editor.proposal.conflictsText | awkward | Ils ont gardé votre version | Ces fichiers ont gardé votre version | done |  |
| fr-B-32 | author:editor.importHint | awkward | Un seul dossier racine est déballé. | Si l’archive n’a qu’un dossier racine, seul son contenu est importé. | done |  |
| fr-B-33 | author:editor.feedback.mine | awkward | puis Soumettez de nouveau pour révision. | puis cliquez sur « Soumettre de nouveau pour révision ». | done |  |
| fr-B-34 | author:editor.withdrawDialog.legend | awkward | Quoi en faire | Que voulez-vous en faire? | kept | Legend: the full question is over 1.3 times as long |
| fr-B-35 | author:review.changesTo | awkward | Modifications de la {version} | Modifications apportées à la {version} | changed | Heading: "Modifications à la {version}" (shorter than suggested); author:review.noChangesTo → "Aucune modification à la {version}." too |
| fr-B-36 | author:picker.published | awkward | publié en {version} | {version} publiée | done |  |
| fr-B-37 | author:risk.note | awkward | Ils sont déduits des fichiers | Ces capacités sont déduites des fichiers | done |  |
| fr-B-38 | workspaces:workspacePage.global | awkward | Toute instance l’a, et tout le monde y est. | Il existe dans toute instance, et tout le monde en est membre. | done |  |
| fr-B-39 | workspaces:workspacePage.personal | awkward | {owner, select, you {Le vôtre seul} other {Celui de son propriétaire seul}} | {owner, select, you {À vous seul} other {À son propriétaire seul}} | done |  |
| fr-B-40 | workspaces:members.anyRole | awkward | Tout rôle | Tous les rôles | kept | Filter option: "Tous les rôles" is over 1.3 times as long |
| fr-B-41 | workspaces:members.removeBody | awkward | La personne cesse de proposer et de réviser là-bas | La personne ne pourra plus y proposer ni y réviser | done |  |
| fr-B-42 | types:description.bundle | awkward | comme un seul | comme un tout | done |  |
| fr-B-43 | errors:OwnMembershipError | awkward | un autre admin ou root le fait | un autre admin ou root doit le faire | done |  |
| fr-B-44 | errors:WorkspaceHasOutsideDependentsError | awkward | ne peuvent être que des dépendances des siens | ne peuvent être des dépendances que pour ses propres éléments | done |  |
| fr-B-45 | errors:ScopeMoveRefusedError | awkward | Ce déplacement casserait quelque chose, listé ci-dessous. | Ce déplacement briserait ce qui est listé ci-dessous. | done |  |
| fr-B-46 | errors:PinLimitError | awkward | Les éléments épinglés de {workspaceName} sont déjà {max}. | {workspaceName} compte déjà {max} éléments épinglés. | done | Applied after the reviewer reverted it: `src/i18n/shelves-errors.test.ts` pinned the old sentence and was updated with it. |
| fr-B-47 | errors:ZipImportError | awkward | et remplacer laisserait le brouillon sans. Fusionnez plutôt. | et le remplacement laisserait le brouillon sans ronne.yaml. Fusionnez plutôt. | done |  |
| fr-B-48 | errors:ReviewMessageError | awkward | Renvoyer ses dépendants | Renvoyer les soumissions qui en dépendent | done |  |
| fr-B-49 | errors:LastRootError | awkward | Faites d’abord de quelqu’un d’autre un root. | Nommez d’abord quelqu’un d’autre root. | done |  |

## French (fr-CA): admin and help

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| fr-C-1 | help:join.question | meaning | Comment me joindre? | Comment devenir membre? | done |  |
| fr-C-2 | admin:userPage.self.body | meaning | Un autre root modifie votre rôle, vous désactive ou réinitialise votre mot de passe. | C’est un autre root qui peut modifier votre rôle, vous désactiver ou réinitialiser votre mot de passe. | done |  |
| fr-C-3 | admin:settings.providerForm.chooseIntro | meaning | Chacun remplit le formulaire et montre ses étapes de configuration. | Chaque choix préremplit le formulaire et affiche ses étapes de configuration. | done |  |
| fr-C-4 | help:usage.answer; admin:audit.sentences.actions.settings.usage_policy | wrong | politique d’utilisation | politique de rapport d’utilisation | changed | help:usage.answer as suggested; in the audit sentence, « le rapport d’utilisation » to match the setting's own label (admin:done.settings.usage). |
| fr-C-5 | help:release-many.answer | wrong | avant que rien ne parte | avant que quoi que ce soit ne parte | done |  |
| fr-C-6 | admin:settings.scim.intro | wrong | Déprovisionner désactive un compte; ne l’efface jamais. | Déprovisionner désactive un compte, mais ne l’efface jamais. | done |  |
| fr-C-7 | admin:move.noItems | wrong | Il n’a pas encore d’éléments. | Elle n’a pas encore d’éléments. | done |  |
| fr-C-8 | admin:users.oneTime.body | wrong | Remettez ceci à l’utilisateur par un canal de confiance. Il ne sera plus affiché. | Remettez ces informations à l’utilisateur par un canal de confiance. Elles ne seront plus affichées. | done |  |
| fr-C-9 | admin:audit.sentences.actions.instance.auth_provider_deleted | wrong | et l’# appartenance que ses groupes donnaient | et l’appartenance que ses groupes donnaient | done |  |
| fr-C-10 | help:global-always.answer | wrong | Son rôle y peut changer | Son rôle peut y changer | done |  |
| fr-C-11 | admin:audit.sentences.parts.ssoReasons.unverified_email | wrong | le fournisseur n’a pas dit que le courriel est vérifié | le fournisseur n’a pas indiqué que le courriel était vérifié | done |  |
| fr-C-12 | help:move-approve.answer | wrong | Si quelque chose casse maintenant | Si quelque chose devait casser maintenant | done |  |
| fr-C-13 | admin:userPage.lastSignInHint | wrong | Pas rmk ni un jeton. | Pas une connexion par rmk ou par un jeton. | done |  |
| fr-C-14 | admin:move.seenBy.personal; help:personal-workspace.answer; help:favorites.answer; help:archived.answer; help:token.answer | wrong | Vous seul | Seulement vous | changed | admin:move.seenBy.personal → « Seulement vous et root »; personal-workspace → « privé et réservé à vous » and « seuls vous et root »; favorites, archived and token → « Personne d’autre ne la/les voit », which also says "root included" more clearly. |
| fr-C-15 | help:pins.answer | wrong | votre espace de travail courant | votre espace de travail actuel | done |  |
| fr-C-16 | help:notice-tone.answer | awkward | une fenêtre de maintenance | une période de maintenance | done |  |
| fr-C-17 | admin:audit.sentences.actions.auth.signed_in | awkward | Connecté avec <code>{provider}</code> | Connexion avec <code>{provider}</code> | done | Covers all three branches of signed_in. |
| fr-C-18 | admin:audit.sentences.actions.auth.sso_signed_in | awkward | Connecté avec le fournisseur d’identité | Connexion avec le fournisseur d’identité | done |  |
| fr-C-19 | admin:audit.sentences.actions.auth.signed_out | awkward | Déconnecté | Déconnexion | done |  |
| fr-C-20 | admin:move.everyoneBody | awkward | Ses éléments deviendront ceux de tout le monde sur cette instance. | Ses éléments seront visibles par tout le monde sur cette instance. | done |  |
| fr-C-21 | admin:move.notReviewed | awkward | et l’approuver les révise | et l’approbation vaut révision | done |  |
| fr-C-22 | admin:move.notMembers | awkward | Travail ouvert de personnes | Travaux en cours de personnes | done |  |
| fr-C-23 | admin:move.blocked.refuses | awkward | Un point listé plus haut refuse le déplacement. | Un des points ci-dessus empêche le déplacement. | done |  |
| fr-C-24 | admin:audit.sentences.parts.scimRefusals.expired | awkward | un jeton au-delà de ses 24 heures après une rotation | un jeton expiré 24 heures après une rotation | done |  |
| fr-C-25 | admin:settings.providerForm.domains | awkward | Domaines de courriel que ce fournisseur connecte | Domaines de courriel pris en charge par ce fournisseur | done |  |
| fr-C-26 | admin:settings.feeds.timeBody | awkward | Claude Code attend 10 secondes un marketplace. | Claude Code attend un marketplace pendant 10 secondes au plus. | done |  |
| fr-C-27 | admin:settings.privacy.lastRun.failed | awkward | la prochaine exécution suit l’horaire | la prochaine exécution aura lieu comme prévu | done |  |
| fr-C-28 | admin:setup.root.again | awkward | Mot de passe de nouveau | Confirmer le mot de passe | done |  |
| fr-C-29 | admin:scopes.create.hint | awkward | <mono>@{name}/élément</mono> | <mono>@{name}/element</mono> | kept | An illustrative placeholder in a hint is fine to translate, and a bare English "element" reads oddly; the low gain doesn't justify the change. |
| fr-C-30 | help:support.question | awkward | Que signifient-ils? | Que signifient ces états? | done |  |
| fr-C-31 | help:password-change.answer | awkward | Désactivez-le pour un compte de test partagé. | Désactivez cette option pour un compte de test partagé. | done |  |
| fr-C-32 | help:queue-decisions.answer | awkward | Chaque ligne les a; | Ils figurent sur chaque ligne; | done |  |
| fr-C-33 | help:dependents-listed.answer | awkward | avec un message à elles | avec un message propre à chacune | done |  |
| fr-C-34 | help:two-factor-policy.question | awkward | Qui doit s’inscrire? | Qui doit l’activer? | done |  |
| fr-C-35 | help:notice.answer | awkward | la langue que lisent vos gens | la langue que lisent vos utilisateurs | done |  |
| fr-C-36 | help:own-row.answer | awkward | Pour que personne ne s’enferme dehors par erreur. | Pour que personne ne se bloque l’accès par erreur. | done |  |
| fr-C-37 | admin:settings.providerForm.groupsClaim | awkward | Claim des groupes | Revendication des groupes (claim) | kept | « Revendication des groupes (claim) » is more than 1.3 times the label's length, and "claim" is the term admins see in their provider consoles. |
| fr-C-38 | admin:settings.feeds.sizeBody; admin:settings.feeds.ofLimit; help:plugin-feeds.answer | typography | 5 MiB | 5 Mio | done | All three occurrences. |
| fr-C-39 | admin:audit.sentences.actions.submission.submitted | glossary | pour révision (révision {revision}) | pour révision (révision {revision}) | changed | Owner, 2026-10-27: « révision » stays for both meanings (no glossary change); this row's sentence, the audit line for a submission, was reworded to « à réviser (révision N) ». |

## French (fr-CA): the website

| # | Key or page | Severity | Now | Suggested | Status | Note |
|---|---|---|---|---|---|---|
| fr-W-1 | www/messages/fr.json:26 | wrong | un modérateur le revoit | un modérateur le révise | done |  |
| fr-W-2 | www/messages/fr.json:49 | awkward | avant qu'un agent pose une action risquée | avant qu'un agent effectue une action risquée | done |  |
| fr-W-3 | www/messages/fr.json:70 | awkward | Comment un élément entre | Comment un élément y entre | done |  |
| fr-W-4 | www/messages/fr.json:187 | awkward | Comment un changement entre | Comment un changement y entre | done |  |
| fr-W-5 | www/messages/fr.json:211 | wrong | Changements demandés | Modifications demandées | done |  |
| fr-W-6 | www/messages/fr.json:212 | wrong | Une version peut être dépréciée | Une version peut être marquée comme obsolète | done |  |
| fr-W-7 | www/messages/fr.json:379 | wrong | la dépréciation et le retrait | l'obsolescence et le retrait | done |  |
| fr-W-8 | www/messages/fr.json:438 | wrong | une version peut être dépréciée | une version peut être marquée comme obsolète | done |  |
| fr-W-9 | www/messages/fr.json:614 | wrong | peuvent être dépréciés ou retirés | peuvent être marqués comme obsolètes ou retirés | done |  |
| fr-W-10 | www/messages/fr.json:391 | awkward | garde les comptes en phase | garde les comptes synchronisés | done | Also replaced « en phase » at fr.json 480, 537 and 544 (« synchronisés »), for consistency. |
| fr-W-11 | www/messages/fr.json:434 | wrong | demandent des changements | demandent des modifications | done |  |
| fr-W-12 | www/messages/fr.json:584 | wrong | Demandez des changements et rejetez | Demandez des modifications et rejetez | done |  |
| fr-W-13 | www/messages/fr.json:480 | typography | qu'une fois ; celui-ci | qu'une fois; celui-ci | done |  |
| fr-W-14 | www/messages/fr.json:489 | typography | datées de juin ; les lignes | datées de juin; les lignes | done |  |
| fr-W-15 | www/src/content/docs/fr/account.tsx:110 | awkward | Ce que l&apos;instance conserve à votre sujet est à un fichier JSON : | Vous pouvez obtenir en un seul fichier JSON ce que l&apos;instance conserve à votre sujet : | done |  |
| fr-W-16 | www/src/content/docs/fr/authentication.tsx:178 | awkward | fait par vous, des | fait par vous, avec les | done |  |
| fr-W-17 | www/src/content/docs/fr/backups.tsx:64 | awkward | écrite lisible par son seul propriétaire | écrite de façon à n&apos;être lisible que par son propriétaire | done |  |
| fr-W-18 | www/src/content/docs/fr/backups.tsx:115 | wrong | runbook de sauvegarde | guide de sauvegarde | done |  |
| fr-W-19 | www/src/content/docs/fr/backups.tsx:131 | awkward | applique les changements de base de données que la version installée a depuis | applique les changements de base de données apparus depuis dans la version installée | done |  |
| fr-W-20 | www/src/content/docs/fr/backups.tsx:145 | meaning | Avec PostgreSQL ou MySQL fournis | Avec le PostgreSQL ou le MySQL inclus dans compose.yaml | changed | Wrote « Avec le PostgreSQL ou le MySQL inclus », without « dans compose.yaml », so the text adds nothing the English doesn't say. |
| fr-W-21 | www/src/content/docs/fr/export.tsx:589 | awkward | à cet élément. Il refuse | pour cet élément. Il refuse | done | Both places, lines 589 and 619. |
| fr-W-22 | www/src/content/docs/fr/install.tsx:124 | wrong | "empty", | "vide", | done | All three "empty" cells now say "vide". |
| fr-W-23 | www/src/content/docs/fr/install.tsx:144 | wrong | "https://RONNE_DOMAIN, or http://localhost:RONNE_PORT" | "https://RONNE_DOMAIN, ou http://localhost:RONNE_PORT" | done |  |
| fr-W-24 | www/src/content/docs/fr/items.tsx:97 | awkward | En liste au moins une | Au moins une dépendance | done |  |
| fr-W-25 | www/src/content/docs/fr/items.tsx:197 | wrong | @acme/acme-infra/deploy is in a private workspace; only its own items can depend on | @acme/acme-infra/deploy est dans un espace de travail privé; seuls ses propres éléments peuvent en dépendre. | done | Quoted the app's French DependencyNotVisibleError text. |
| fr-W-26 | www/src/content/docs/fr/logs.tsx:83 | wrong | Un plugin feed a été construit | Un flux de plugins a été construit | done |  |
| fr-W-27 | www/src/content/docs/fr/logs.tsx:86 | wrong | Un plugin feed approche de sa taille limite | Un flux de plugins approche de sa taille limite | done |  |
| fr-W-28 | www/src/content/docs/fr/logs.tsx:87 | wrong | Un plugin a été laissé hors d'un plugin feed | Un plugin a été laissé hors d'un flux de plugins | done |  |
| fr-W-29 | www/src/content/docs/fr/logs.tsx:136 | awkward | la suivante aura lieu à l'heure | la suivante aura lieu à l'heure prévue | done |  |
| fr-W-30 | www/src/content/docs/fr/logs.tsx:290 | wrong | Derrière un proxy qui pose | Derrière un mandataire qui pose | done |  |
| fr-W-31 | www/src/content/docs/fr/monitoring.tsx:132 | wrong | celle d&apos;un proxy ou d&apos;un client | celle d&apos;un mandataire ou d&apos;un client | done |  |
| fr-W-32 | www/src/content/docs/fr/overview.tsx:127 | wrong | tant qu&apos;un espace de travail est le vôtre courant | tant qu&apos;un espace de travail est votre espace de travail courant | done |  |
| fr-W-33 | www/src/content/docs/fr/overview.tsx:137 | awkward | que vous seul voyez, root compris | que vous seul voyez (root ne la voit pas non plus) | done |  |
| fr-W-34 | www/src/content/docs/fr/overview.tsx:153 | typography | privé ; les mots-clés | privé; les mots-clés | done |  |
| fr-W-35 | www/src/content/docs/fr/overview.tsx:158 | typography | d&apos;installation ; le choix | d&apos;installation; le choix | done |  |
| fr-W-36 | www/src/content/docs/fr/overview.tsx:158 | awkward | le choix reste en recherchant, filtrant, triant et paginant | le choix est conservé quand vous recherchez, filtrez, triez ou changez de page | done |  |
| fr-W-37 | www/src/content/docs/fr/overview.tsx:175 | awkward | une personne nouvelle | un nouvel utilisateur | done |  |
| fr-W-38 | www/src/content/docs/fr/overview.tsx:180 | typography | dans une fenêtre ; tant | dans une fenêtre; tant | done |  |
| fr-W-39 | www/src/content/docs/fr/overview.tsx:187 | typography | non révoqué ; un jeton | non révoqué; un jeton | done |  |
| fr-W-40 | www/src/content/docs/fr/overview.tsx:198 | typography | depuis le Catalogue ; chaque page | depuis le Catalogue; chaque page | done |  |
| fr-W-41 | www/src/content/docs/fr/overview.tsx:206 | wrong | ne retient pas le reste. | Cette étape ne bloque pas les autres. (replacing also the « Il » that ends line 205) | done | Removed the « Il » at the end of line 205 too. |
| fr-W-42 | www/src/content/docs/fr/overview.tsx:211 | typography | une seule fois ; la | une seule fois; la | done |  |
| fr-W-43 | www/src/content/docs/fr/overview.tsx:212 | awkward | visite suivante n&apos;a plus rien | bannière n&apos;apparaît plus à la visite suivante | done |  |
| fr-W-44 | www/src/content/docs/fr/overview.tsx:219 | typography | JavaScript ; la fenêtre | JavaScript; la fenêtre | done |  |
| fr-W-45 | www/src/content/docs/fr/plugins.tsx:153 | awkward | Claude Code la lance depuis | Claude Code lance <Code>rmk auth headers</Code> depuis | done |  |
| fr-W-46 | www/src/content/docs/fr/privacy.tsx:23 | wrong | L'adresse IP et le user agent du navigateur | L'adresse IP et l'agent utilisateur du navigateur | done |  |
| fr-W-47 | www/src/content/docs/fr/privacy.tsx:66 | wrong | le user agent d&apos;un navigateur | l&apos;agent utilisateur d&apos;un navigateur | done |  |
| fr-W-48 | www/src/content/docs/fr/privacy.tsx:68 | awkward | l&apos;attendent des limites de rétention | l&apos;attendent en matière de limites de conservation | done |  |
| fr-W-49 | www/src/content/docs/fr/privacy.tsx:126 | meaning | jusqu&apos;à un jour | jusqu&apos;à un minimum d&apos;un jour | done |  |
| fr-W-50 | www/src/content/docs/fr/privacy.tsx:185 | awkward | et demande le courriel du compte, saisi, | et demande de saisir le courriel du compte | done |  |
| fr-W-51 | www/src/content/docs/fr/privacy.tsx:218 | wrong | avec le compte de ce qui a disparu | avec le décompte de ce qui a disparu | done |  |
| fr-W-52 | www/src/content/docs/fr/privacy.tsx:271 | awkward | C&apos;est un relevé de vous | C&apos;est un relevé de vos données | done |  |
| fr-W-53 | www/src/content/docs/fr/privacy.tsx:320 | awkward | les tarballs | les archives .tgz | done |  |
| fr-W-54 | www/src/content/docs/fr/provider-guides.tsx:165 | wrong | page du provider | page du fournisseur | done |  |
| fr-W-55 | www/src/content/docs/fr/review.tsx:476 | wrong | changements et le rejet en exigent un | modifications et le rejet en exigent un | done |  |
| fr-W-56 | www/src/content/docs/fr/review.tsx:544 | wrong | La demande de changements et le rejet restent | La demande de modifications et le rejet restent | done |  |
| fr-W-57 | www/src/content/docs/fr/rmk.tsx:418 | awkward | quitte avec le code 3 | se termine avec le code 3 | done |  |
| fr-W-58 | www/src/content/docs/fr/rmk.tsx:477 | wrong | soumettre vos brouillons à la révision | soumettre vos brouillons pour révision | done |  |
| fr-W-59 | www/src/content/docs/fr/roles.tsx:16 | wrong | Proposer un changement à un élément publié | Proposer une modification à un élément publié | done |  |
| fr-W-60 | www/src/content/docs/fr/usage.tsx:109 | awkward | son remote | son dépôt distant | done |  |
| fr-W-61 | www/src/content/docs/fr/versions.tsx:67 | meaning | dépendance ou un fichier nommé supprimé. | la suppression d&apos;une option, d&apos;une dépendance ou d&apos;un fichier nommé. | done |  |
| fr-W-62 | www/src/content/docs/fr/versions.tsx:110 | awkward | l&apos;étiquette est convertie en la | l&apos;étiquette est remplacée par la | done |  |
| fr-W-63 | www/src/content/docs/fr/workspaces.tsx:52 | wrong | les Filters du | les Filtres du | done |  |
| fr-W-64 | www/src/content/docs/fr/workspaces.tsx:79 | wrong | Everyone on this instance | Tout le monde sur cette instance | kept | Owner decision: global's description is seeded data stored in English and shown as written. |
| fr-W-65 | www/src/content/docs/fr/workspaces.tsx:281 | wrong | que vous pouvez utiliser | que vous puissiez utiliser | done | « que vous puissiez utiliser », matching the colleague's fix to DraftScopeNotFoundError in the app. |
| fr-W-66 | www/src/content/docs/fr/workspaces.tsx:396 | typography | Vous n&rsquo;êtes pas membre de l&rsquo;espace de travail acme | Vous n&apos;êtes pas membre de l&apos;espace de travail acme | done |  |
| fr-W-67 | www/src/content/docs/fr/workspaces.tsx:702 | awkward | Ce qui refuse un déplacement | Ce qui empêche un déplacement | done | Also lines 698, 720 and 729 (« ce qui empêche le déplacement », « ce qui l'empêche », « ce qui l'empêcherait »). |
| fr-W-68 | www/src/content/docs/fr/workspaces.tsx:788 | wrong | les compte contre la limite de 12 | les compte par rapport à la limite de 12 | done |  |
