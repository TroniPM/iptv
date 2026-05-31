# IPTV Player

Um player IPTV que roda diretamente no navegador. Sem conta, sem servidor, sem instalação — é só abrir a página e adicionar a sua lista M3U.

> 🇺🇸 Read in [English](README.md)

---

## Requisitos

Antes de começar, certifique-se de ter o **Node.js** instalado no seu computador. Você pode baixar em [nodejs.org](https://nodejs.org).

---

## Como Iniciar

**1. Instalar as dependências**

Abra um terminal na pasta do projeto e execute:

```
npm install
```

**2. Iniciar o servidor de desenvolvimento**

```
npm run dev
```

Depois, abra no navegador o endereço que aparecer no terminal (geralmente `http://localhost:5173`).

---

## Build para Produção

Para gerar uma versão pronta para publicar:

```
npm run build
```

Os arquivos finais serão gerados na pasta `dist/`. Você pode hospedá-los em qualquer servidor de arquivos estáticos (GitHub Pages, Netlify, nginx, etc.) ou simplesmente abrir o `index.html` direto no navegador — sem necessidade de servidor.

Para visualizar a build de produção localmente antes de publicar:

```
npm run preview
```

---

## Como Usar

1. Vá em **Configurações** e adicione uma lista (arquivo M3U ou URL).
2. Volte para a tela do **Player**.
3. Selecione a lista no seletor no topo da barra lateral de canais.
4. Clique em qualquer canal para começar a assistir.

---

## Funcionalidades

### Player

- **Streaming HLS** — reproduz canais de TV ao vivo usando o protocolo HLS (o formato mais comum para IPTV).
- **Barra lateral de canais** — navegue pelos canais organizados por grupo. Você pode buscar, expandir/recolher grupos e redimensionar a barra lateral arrastando a borda.
- **Favoritos** — clique no ícone de coração ao lado de qualquer canal para salvá-lo. Acesse os favoritos pela aba Favoritos na barra lateral.
- **Histórico de assistidos** — os últimos 50 canais assistidos são salvos automaticamente. Acesse pela aba Recentes na barra lateral.
- **EPG (Guia de Programação)** — veja o que está passando agora e a programação completa do dia, direto no player. Requer uma fonte EPG configurada em Configurações.
- **Picture-in-Picture (PiP)** — destaque o vídeo em uma janela flutuante para continuar assistindo enquanto navega em outras abas.
- **Seleção manual de qualidade** — se o stream tiver múltiplos níveis de qualidade, você pode escolher um manualmente em vez de depender da seleção automática.
- **Estatísticas do stream** — ative um painel de estatísticas em tempo real: bitrate, resolução, buffer e frames perdidos.

---

## Configurações

### Idioma

Escolha o idioma da interface. Atualmente suportados: **Português (Brasil)** e **English (US)**.

---

### Diversos

- **Agrupamento de canais** — quando ativado, os canais no player são organizados em grupos (categorias) do seu arquivo M3U. Quando desativado, todos os canais aparecem em lista plana.
- **Proxy CORS** — alguns streams bloqueiam requisições diretas do navegador por restrições de CORS. Você pode ativar um proxy e informar a URL de um serviço de proxy CORS para contornar isso. O proxy é aplicado tanto na reprodução dos streams quanto no download de listas M3U por URL.

---

### Minhas Listas

Gerencie todas as suas listas M3U em um único lugar.

**Importar uma lista**

- **Por URL** — cole a URL de uma lista M3U hospedada na internet. O app vai baixar e processar automaticamente.
- **Por arquivo** — faça upload de um arquivo `.m3u` ou `.m3u8` do seu computador.

**Gerenciar uma lista**

Clique em uma lista para abrir o painel de gerenciamento:

- **Aba Geral** — renomeie ou exclua a lista.
- **Aba Grupos** — veja todos os grupos de canais dessa lista. A partir daqui você pode:
  - Renomear um grupo.
  - Excluir um grupo (isso remove todos os canais daquele grupo da lista).
  - Criar um novo grupo copiando canais de um grupo existente.
  - **Mover canais entre grupos** — expanda um grupo para ver seus canais e arraste um canal para o cabeçalho de outro grupo para movê-lo.

---

### EPG (Guia de Programação)

Adicione uma ou mais fontes EPG no formato XMLTV para ver a grade de programação no player.

- **Adicionar fonte** — dê um nome e cole a URL de um arquivo `.xml` ou `.xmltv`.
- **Atualizar** — clique no botão de atualizar ao lado de uma fonte para baixar os dados de programação mais recentes. Isso precisa ser feito manualmente sempre que quiser dados atualizados.
- **Excluir** — remove a fonte EPG e todos os dados de programação associados.

Depois de carregar uma fonte EPG, abra qualquer canal no player e clique no botão **EPG** para ver o que está passando agora e a programação do restante do dia.

> Para que o EPG corresponda aos canais, o canal no seu arquivo M3U precisa ter um `tvg-id` que coincida com o ID do canal no arquivo XMLTV.

---

## TODOs

As funcionalidades abaixo ainda não foram implementadas ou foram implementadas apenas parcialmente.

### Não implementado

| Funcionalidade | Observações |
|---|---|
| Múltiplos perfis | Diferentes listas de canais e configurações para usuários distintos no mesmo dispositivo. |
| Atualização automática de listas por URL | Re-baixar listas importadas via URL em um intervalo configurável. |
| Verificação de saúde dos canais | Testar cada URL de canal e marcar os que estão offline ou quebrados. |
| Atalhos de teclado | Controlar a reprodução (play/pause, mudo, tela cheia) e navegar entre canais pelo teclado. |
| Modo telão / kiosk | Ocultar toda a interface em tela cheia, deixando apenas o vídeo. |
| Exportar lista como M3U | Exportar uma lista filtrada ou personalizada de volta como arquivo M3U. |
| Xtream Codes API | Importar listas usando credenciais de servidor Xtream (usuário, senha, host) em vez de uma URL M3U direta. |
| Importação por QR code | Ler uma URL de lista M3U via câmera usando QR code. |
| Alternância de tema claro/escuro | Atualmente o app só tem tema escuro. |
| Barra de progresso na importação | Exibir indicador de progresso ao carregar listas grandes. |
| `<html lang>` dinâmico | Atualizar o atributo de idioma da página quando o usuário mudar o idioma nas configurações. |

### Parcialmente implementado

| Funcionalidade | Estado atual |
|---|---|
| Reordenação de canais | Drag & drop existe em Configurações para mover canais *entre grupos*, mas não há como reordenar canais *dentro* de um grupo nem reordenar a ordem dos grupos na barra lateral. |
| Persistência do estado dos grupos | Os grupos são auto-expandidos quando uma lista carrega. As escolhas manuais de expandir/recolher do usuário não são salvas entre sessões. |

---

## Open Source

Este projeto é open source. Contribuições são bem-vindas!

- Encontrou um bug? [Abra uma issue](../../issues).
- Tem uma ideia ou quer implementar algo da lista de TODOs? [Envie um pull request](../../pulls).
- Não sabe por onde começar? Veja a tabela de TODOs acima — todos os itens estão disponíveis para contribuição.

Ao enviar um PR, mantenha as mudanças focadas e descreva qual problema está resolvendo.
