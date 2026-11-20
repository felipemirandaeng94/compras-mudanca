# Compras da Mudança

App instalável (PWA) para o casal centralizar tudo o que precisa comprar na mudança: lista com fotos e preços, teto de gastos com aviso, resumo por cômodo e sincronização em tempo real entre os celulares. Cole o link de um produto e o app preenche nome, preço, loja e foto.

Site: https://felipemirandaeng94.github.io/compras-mudanca/

## Como instalar

**Android (Chrome):** abra o site, toque nos três pontos e em "Instalar app" (ou "Adicionar à tela inicial"). Depois de instalado, o app aparece no menu Compartilhar das lojas: compartilhe um produto e o cadastro abre já preenchido.

**iPhone (Safari):** abra o site, toque em Compartilhar e em "Adicionar à Tela de Início". No iPhone não existe a opção de compartilhar para o app: copie o link da loja e cole no campo "Link do produto".

## Estrutura

- `index.html`, `styles.css`: página e estilos (tema claro/escuro).
- `app.js`: telas (Lista, Adicionar/Editar, Resumo, Ajustes), deslizar, detalhe, compartilhamento.
- `db.js`: camada de dados (Supabase: tabelas `itens` e `configuracoes`, Realtime, Storage `fotos`, função `ler-link`) e modo demo.
- `util.js`, `ui.js`: formatação, DOM seguro, máscara de moeda, toast e confirmação.
- `config.js`: URL e chave pública do Supabase.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA e ícones.

## Testar sem backend

Abra o site com `?demo=1` para usar dados falsos em memória (`&vazio=1` para a lista vazia).

Sem build: HTML, CSS e JavaScript puro. Para rodar localmente: `python3 -m http.server` na pasta.
