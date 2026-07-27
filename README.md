[README.md](https://github.com/user-attachments/files/30420642/README.md)
# Quartile Pipeline

Sistema web para organizar clientes, rounds de otimização, ASINs, tarefas diárias e o fluxo de aprovação e upload.

## Estrutura

```text
quartile-pipeline/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── .gitignore
└── README.md
```

## Executar localmente

Você pode abrir o arquivo `index.html` diretamente no navegador. Para evitar restrições do navegador, também pode usar a extensão **Live Server** no VS Code.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos e pastas deste projeto.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`.
6. Salve e aguarde a geração do endereço público.

## Salvamento dos dados

Os dados são armazenados no `localStorage` do navegador. Portanto:

- ficam disponíveis apenas no navegador e dispositivo em que foram cadastrados;
- podem ser apagados ao limpar os dados do navegador;
- não são compartilhados automaticamente entre usuários;
- recomenda-se usar regularmente a opção de exportar backup.

Para uso em equipe e sincronização entre computadores, a próxima evolução recomendada é conectar o sistema a um banco de dados, como Supabase.

## Pendências automáticas

Cada round possui a etapa final **Verificar página do produto**, exibida logo após o upload. Todas as etapas não marcadas do round ativo aparecem automaticamente no Daily Memo. Ao concluir uma tarefa automática no Daily Memo, a etapa correspondente também é marcada no round.


## Calendário de tarefas concluídas

A aba **Calendário** permite registrar tarefas concluídas em qualquer data. Demandas manuais marcadas como concluídas e etapas de round concluídas pelo Daily Memo também são registradas automaticamente.
