import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Códigos de locale suportados.
 * Para adicionar um novo idioma:
 *   1. Adicione o código aqui (ex: 'es-ES')
 *   2. Adicione o locale em LOCALES
 *   3. Adicione as chaves em UI_TRANSLATIONS
 *   4. Adicione as traduções de grupos em GROUP_TRANSLATIONS
 */
export type Locale = 'pt-BR' | 'en-US'

export interface LocaleOption {
  code: Locale
  label: string
  flag: string
}

export const LOCALES: LocaleOption[] = [
  { code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en-US', label: 'English (US)',        flag: '🇺🇸' },
]

// ─── Traduções de interface ───────────────────────────────────────────────────

const UI_TRANSLATIONS: Record<Locale, Record<string, string>> = {
  'pt-BR': {
    // Navegação
    'nav.player':   'Player',
    'nav.manage':   'Gerenciar Listas',
    'nav.settings': 'Configurações',

    // Tela de configurações
    'settings.title':                'Configurações',
    'settings.language.section':     'Idioma',
    'settings.language.description': 'Define o idioma da interface e dos nomes dos grupos de canais.',
    'settings.saved':                'Configurações salvas.',
    'settings.misc.title':           'Diversos',
    'settings.lists.title':          'Minhas Listas',
    'settings.forceHttps.title':     'Forçar HTTPS nos Streams',
    'settings.forceHttps.desc':      'Substitui http:// por https:// nas URLs dos canais. Resolve o bloqueio de Mixed Content no GitHub Pages e outros sites HTTPS. Pode falhar em servidores que não suportam HTTPS.',
    'settings.insecureContent.title':  'Alternativa: Permitir Conteúdo Não Seguro',
    'settings.insecureContent.desc':   'Se o Forçar HTTPS não resolver, você pode liberar conteúdo não seguro diretamente nas configurações do Chrome ou Edge:',
    'settings.insecureContent.step1':  'Abra a URL de configurações abaixo no seu navegador (copie e cole na barra de endereços).',
    'settings.insecureContent.step2':  'Localize a opção "Conteúdo não seguro".',
    'settings.insecureContent.step3':  'Altere para "Permitir".',
    'settings.insecureContent.openUrl': 'URL:',
    'settings.insecureContent.copy':   'Copiar',
    'settings.insecureContent.copied': 'Copiado!',
    'settings.insecureContent.otherBrowser': 'Dica: se você usar o Chrome ou Microsoft Edge, é possível permitir conteúdo não seguro especificamente para este site, sem precisar do proxy.',

    // Player — erros de stream
    'player.stream.error.init':             'Falha ao inicializar o stream.',
    'player.stream.error.playback':         'Erro ao reproduzir o stream. Verifique a URL ou configure um proxy.',
    'player.stream.error.invalidUrl':       'URL do canal inválida ou com protocolo não suportado.',
    'player.stream.error.autoplayBlocked':  'Autoplay bloqueado pelo navegador. Clique em reproduzir no player.',
    'player.stream.error.mixedContent':     'Este canal usa HTTP, mas a página está em HTTPS. O navegador bloqueou a requisição (Mixed Content). Ative o Proxy CORS nas configurações para contornar este problema.',

    // Player — painel de estatísticas
    'player.stats.show':             'Stats',
    'player.stats.title':            'Estatísticas',
    'player.stats.bitrate':          'Bitrate',
    'player.stats.resolution':       'Resolução',
    'player.stats.buffer':           'Buffer',
    'player.stats.dropped':          'Frames perdidos',
    'player.stats.quality':          'Nível Q.',

    // Player — overlays e sidebar
    'player.empty':                  'Selecione um canal para reproduzir',
    'player.sidebar.open':           'Abrir lista',
    'player.sidebar.close':          'Fechar lista',
    'player.sidebar.selectPlaylist': 'Selecione uma lista',
    'player.sidebar.search':         'Buscar canal...',
    'player.sidebar.expandAll':      'Expandir todos',
    'player.sidebar.collapseAll':    'Recolher todos',
    'player.sidebar.noPlaylist':     'Nenhuma lista selecionada.',

    // Player — abas da sidebar
    'player.tabs.channels':          'Canais',
    'player.tabs.favorites':         'Favoritos',
    'player.tabs.history':           'Recentes',

    // Player — favoritos
    'player.favorites.empty':        'Nenhum favorito ainda.\nClique no ♡ ao lado de um canal.',

    // Player — histórico
    'player.history.empty':          'Nenhum canal assistido ainda.',
    'player.history.clear':          'Limpar histórico',

    // Player — qualidade
    'player.quality.label':          'Qualidade',
    'player.quality.auto':           'Auto',

    // Player — PiP
    'player.pip.enter':              'PiP',
    'player.pip.exit':               '✕ PiP',

    // Player — EPG
    'player.epg.button':             'EPG',
    'player.epg.noData':             'Sem dados de programação para este canal.',
    'player.epg.now':                'Agora',
    'player.epg.schedule':           'Programação do dia',
    'player.epg.noSources':          'Nenhuma fonte EPG configurada.',

    // Configurações — EPG
    'settings.epg.title':            'EPG (Guia de Programação)',
    'settings.epg.description':      'Adicione fontes XMLTV para exibir a grade de programação dos canais.',
    'settings.epg.addSource':        'Adicionar Fonte',
    'settings.epg.sourceName':       'Nome da fonte',
    'settings.epg.sourceUrl':        'URL do arquivo XMLTV',
    'settings.epg.refresh':          'Atualizar',
    'settings.epg.delete':           'Excluir',
    'settings.epg.lastFetched':      'Última atualização:',
    'settings.epg.never':            'Nunca',
    'settings.epg.fetching':         'Buscando...',
    'settings.epg.noSources':        'Nenhuma fonte EPG adicionada.',
    'settings.epg.namePlaceholder':  'Ex: EPG Brasil',
    'settings.epg.urlPlaceholder':   'https://exemplo.com/epg.xml',
    'manage.import.button':          '+ Importar Lista',
    'manage.empty.line1':            'Nenhuma lista importada.',
    'manage.empty.line2':            'Clique em "Importar Lista" para começar.',
    'manage.table.name':             'Nome',
    'manage.table.source':           'Origem',
    'manage.table.addedAt':          'Adicionada em',
    'manage.table.actions':          'Ações',
    'manage.source.url':             '🌐 URL',
    'manage.source.file':            '📁 Arquivo',

    // Gerenciar listas — ações genéricas
    'manage.action.save':            'Salvar',
    'manage.action.cancel':          'Cancelar',
    'manage.action.rename':          'Renomear',
    'manage.action.delete':          'Excluir',

    // Gerenciar listas — painel de gerenciamento
    'manage.panel.title':            'Gerenciar:',
    'manage.tab.general':            '⚙ Geral',
    'manage.tab.groups':             '📂 Grupos',
    'manage.general.renameLabel':    'Renomear lista',
    'manage.general.danger':         'Zona de perigo — esta ação não pode ser desfeita.',
    'manage.general.deleteList':     'Excluir Lista',

    // Gerenciar listas — grupos
    'manage.groups.loading':         'Carregando grupos...',
    'manage.groups.empty':           'Nenhum grupo encontrado nesta lista.',
    'manage.groups.channels':        'canal(is)',
    'manage.groups.dropHere':        '↙ Soltar aqui',
    'manage.groups.loadingChannels': 'Carregando canais...',
    'manage.groups.emptyGroup':      'Grupo sem canais.',
    'manage.groups.createNew':       '+ Criar novo grupo',
    'manage.groups.createDesc':      'Move todos os canais de um grupo existente para o novo nome de grupo.',
    'manage.groups.newName':         'Nome do novo grupo',
    'manage.groups.newNamePlaceholder': 'Ex: Esportes HD',
    'manage.groups.moveFrom':        'Mover canais do grupo',
    'manage.groups.selectGroup':     'Selecione um grupo...',
    'manage.groups.createButton':    'Criar Grupo',

    // Gerenciar listas — configurações embutidas
    'manage.settings.title':              'Configurações',
    'manage.settings.grouping.title':     'Agrupamento Inteligente',
    'manage.settings.grouping.desc':      'Categoriza canais automaticamente por palavras-chave (ex: ESPN → Esportes). Desativado exibe lista plana.',
    'manage.settings.proxy.title':        'Proxy CORS',
    'manage.settings.proxy.desc':         'Roteia streams e downloads de lista pelo proxy para contornar restrições CORS.',
    'manage.settings.proxy.active':       '✓ Proxy ativo',
    'manage.settings.proxy.configured':   'Proxy configurado, mas desativado.',
    'manage.settings.proxy.noUrl':        'Configure uma URL para habilitar o proxy.',
    'manage.settings.proxy.placeholder':  'https://meu-proxy.exemplo.com/?url=',

    // Gerenciar listas — modal de importação
    'manage.import.title':           'Importar Lista M3U',
    'manage.import.tabUrl':          '🌐 Via URL',
    'manage.import.tabFile':         '📁 Via Arquivo',
    'manage.import.nameLabel':       'Nome da lista *',
    'manage.import.namePlaceholder': 'Ex: Minha TV',
    'manage.import.urlLabel':        'URL do arquivo M3U *',
    'manage.import.urlPlaceholder':  'https://exemplo.com/lista.m3u',
    'manage.import.fileLabel':       'Arquivo .m3u / .m3u8 *',
    'manage.import.submit':          'Importar',

    // Gerenciar listas — erros de validação
    'manage.error.noName':           'Informe um nome para a lista.',
    'manage.error.noUrl':            'Informe a URL da lista M3U.',
    'manage.error.noFile':           'Nenhum arquivo selecionado ou conteúdo vazio.',
    'manage.error.import':           'Erro desconhecido ao importar.',

    // Gerenciar listas — confirmações (use tParam para {name} e {count})
    'manage.confirm.deleteList':     'Excluir a lista "{name}" e todos os seus canais?',
    'manage.confirm.deleteGroup':    'Excluir o grupo "{name}" e seus {count} canal(is)?',
  },
  'en-US': {
    // Navigation
    'nav.player':   'Player',
    'nav.manage':   'Manage Playlists',
    'nav.settings': 'Settings',

    // Settings screen
    'settings.title':                'Settings',
    'settings.language.section':     'Language',
    'settings.language.description': 'Sets the interface language and channel group names.',
    'settings.saved':                'Settings saved.',
    'settings.misc.title':           'Miscellaneous',
    'settings.lists.title':          'My Playlists',
    'settings.forceHttps.title':     'Force HTTPS on Streams',
    'settings.forceHttps.desc':      'Replaces http:// with https:// in channel URLs. Fixes Mixed Content blocking on GitHub Pages and other HTTPS sites. May fail on servers that do not support HTTPS.',
    'settings.insecureContent.title':  'Alternative: Allow Insecure Content',
    'settings.insecureContent.desc':   'If Force HTTPS does not work, you can allow insecure content directly in Chrome or Edge settings:',
    'settings.insecureContent.step1':  'Open the settings URL below in your browser (copy and paste into the address bar).',
    'settings.insecureContent.step2':  'Find the "Insecure content" option.',
    'settings.insecureContent.step3':  'Set it to "Allow".',
    'settings.insecureContent.openUrl': 'URL:',
    'settings.insecureContent.copy':   'Copy',
    'settings.insecureContent.copied': 'Copied!',
    'settings.insecureContent.otherBrowser': 'Tip: if you use Chrome or Microsoft Edge, you can allow insecure content specifically for this site, without needing a proxy.',

    // Player — stream errors
    'player.stream.error.init':             'Failed to initialize the stream.',
    'player.stream.error.playback':         'Stream playback error. Check the URL or configure a proxy.',
    'player.stream.error.invalidUrl':       'Invalid channel URL or unsupported protocol.',
    'player.stream.error.autoplayBlocked':  'Autoplay blocked by the browser. Click play in the player.',
    'player.stream.error.mixedContent':     'This channel uses HTTP, but the page is on HTTPS. The browser blocked the request (Mixed Content). Enable the CORS Proxy in settings to work around this.',

    // Player — stats panel
    'player.stats.show':             'Stats',
    'player.stats.title':            'Statistics',
    'player.stats.bitrate':          'Bitrate',
    'player.stats.resolution':       'Resolution',
    'player.stats.buffer':           'Buffer',
    'player.stats.dropped':          'Dropped frames',
    'player.stats.quality':          'Q. Level',

    // Player — overlays & sidebar
    'player.empty':                  'Select a channel to play',
    'player.sidebar.open':           'Open list',
    'player.sidebar.close':          'Close list',
    'player.sidebar.selectPlaylist': 'Select a playlist',
    'player.sidebar.search':         'Search channel...',
    'player.sidebar.expandAll':      'Expand all',
    'player.sidebar.collapseAll':    'Collapse all',
    'player.sidebar.noPlaylist':     'No playlist selected.',

    // Player — sidebar tabs
    'player.tabs.channels':          'Channels',
    'player.tabs.favorites':         'Favorites',
    'player.tabs.history':           'Recent',

    // Player — favorites
    'player.favorites.empty':        'No favorites yet.\nClick ♡ next to a channel.',

    // Player — history
    'player.history.empty':          'No channels watched yet.',
    'player.history.clear':          'Clear history',

    // Player — quality
    'player.quality.label':          'Quality',
    'player.quality.auto':           'Auto',

    // Player — PiP
    'player.pip.enter':              'PiP',
    'player.pip.exit':               '✕ PiP',

    // Player — EPG
    'player.epg.button':             'EPG',
    'player.epg.noData':             'No program data for this channel.',
    'player.epg.now':                'Now',
    'player.epg.schedule':           "Today's schedule",
    'player.epg.noSources':          'No EPG source configured.',

    // Settings — EPG
    'settings.epg.title':            'EPG (Program Guide)',
    'settings.epg.description':      'Add XMLTV sources to display the program schedule for channels.',
    'settings.epg.addSource':        'Add Source',
    'settings.epg.sourceName':       'Source name',
    'settings.epg.sourceUrl':        'XMLTV file URL',
    'settings.epg.refresh':          'Refresh',
    'settings.epg.delete':           'Delete',
    'settings.epg.lastFetched':      'Last updated:',
    'settings.epg.never':            'Never',
    'settings.epg.fetching':         'Fetching...',
    'settings.epg.noSources':        'No EPG source added.',
    'settings.epg.namePlaceholder':  'E.g.: US EPG',
    'settings.epg.urlPlaceholder':   'https://example.com/epg.xml',

    // Manage playlists — header & table
    'manage.title':                  'My M3U Playlists',
    'manage.import.button':          '+ Import Playlist',
    'manage.empty.line1':            'No playlist imported.',
    'manage.empty.line2':            'Click "Import Playlist" to get started.',
    'manage.table.name':             'Name',
    'manage.table.source':           'Source',
    'manage.table.addedAt':          'Added on',
    'manage.table.actions':          'Actions',
    'manage.source.url':             '🌐 URL',
    'manage.source.file':            '📁 File',

    // Manage playlists — generic actions
    'manage.action.save':            'Save',
    'manage.action.cancel':          'Cancel',
    'manage.action.rename':          'Rename',
    'manage.action.delete':          'Delete',

    // Manage playlists — management panel
    'manage.panel.title':            'Manage:',
    'manage.tab.general':            '⚙ General',
    'manage.tab.groups':             '📂 Groups',
    'manage.general.renameLabel':    'Rename playlist',
    'manage.general.danger':         'Danger zone — this action cannot be undone.',
    'manage.general.deleteList':     'Delete Playlist',

    // Manage playlists — groups
    'manage.groups.loading':         'Loading groups...',
    'manage.groups.empty':           'No groups found in this playlist.',
    'manage.groups.channels':        'channel(s)',
    'manage.groups.dropHere':        '↙ Drop here',
    'manage.groups.loadingChannels': 'Loading channels...',
    'manage.groups.emptyGroup':      'Empty group.',
    'manage.groups.createNew':       '+ Create new group',
    'manage.groups.createDesc':      'Moves all channels from an existing group to the new group name.',
    'manage.groups.newName':         'New group name',
    'manage.groups.newNamePlaceholder': 'E.g.: Sports HD',
    'manage.groups.moveFrom':        'Move channels from group',
    'manage.groups.selectGroup':     'Select a group...',
    'manage.groups.createButton':    'Create Group',

    // Manage playlists — embedded settings
    'manage.settings.title':              'Settings',
    'manage.settings.grouping.title':     'Smart Grouping',
    'manage.settings.grouping.desc':      'Automatically categorizes channels by keywords (e.g.: ESPN → Sports). Disabled shows a flat list.',
    'manage.settings.proxy.title':        'CORS Proxy',
    'manage.settings.proxy.desc':         'Routes streams and playlist downloads through the proxy to bypass CORS restrictions.',
    'manage.settings.proxy.active':       '✓ Proxy active',
    'manage.settings.proxy.configured':   'Proxy configured, but disabled.',
    'manage.settings.proxy.noUrl':        'Configure a URL to enable the proxy.',
    'manage.settings.proxy.placeholder':  'https://my-proxy.example.com/?url=',

    // Manage playlists — import modal
    'manage.import.title':           'Import M3U Playlist',
    'manage.import.tabUrl':          '🌐 Via URL',
    'manage.import.tabFile':         '📁 Via File',
    'manage.import.nameLabel':       'Playlist name *',
    'manage.import.namePlaceholder': 'E.g.: My TV',
    'manage.import.urlLabel':        'M3U file URL *',
    'manage.import.urlPlaceholder':  'https://example.com/playlist.m3u',
    'manage.import.fileLabel':       '.m3u / .m3u8 file *',
    'manage.import.submit':          'Import',

    // Manage playlists — validation errors
    'manage.error.noName':           'Please provide a name for the playlist.',
    'manage.error.noUrl':            'Please provide the M3U playlist URL.',
    'manage.error.noFile':           'No file selected or content is empty.',
    'manage.error.import':           'Unknown error while importing.',

    // Manage playlists — confirmations (use tParam for {name} and {count})
    'manage.confirm.deleteList':     'Delete playlist "{name}" and all its channels?',
    'manage.confirm.deleteGroup':    'Delete group "{name}" and its {count} channel(s)?',
  },
}

// ─── Traduções dos grupos de canais ──────────────────────────────────────────

/**
 * Mapa de tradução dos grupos inteligentes.
 * A chave é o nome interno (pt-BR) definido em SMART_GROUP_RULES.
 * Para adicionar um novo idioma, inclua a entrada correspondente em cada grupo.
 */
const GROUP_TRANSLATIONS: Record<string, Record<Locale, string>> = {
  'Esportes':       { 'pt-BR': 'Esportes',       'en-US': 'Sports'          },
  'Notícias':       { 'pt-BR': 'Notícias',        'en-US': 'News'            },
  'Filmes':         { 'pt-BR': 'Filmes',           'en-US': 'Movies'          },
  'Séries':         { 'pt-BR': 'Séries',           'en-US': 'Series'          },
  'Infantil':       { 'pt-BR': 'Infantil',         'en-US': 'Kids'            },
  'Documentários':  { 'pt-BR': 'Documentários',    'en-US': 'Documentaries'   },
  'Entretenimento': { 'pt-BR': 'Entretenimento',   'en-US': 'Entertainment'   },
  'Música':         { 'pt-BR': 'Música',           'en-US': 'Music'           },
  'Variedades':     { 'pt-BR': 'Variedades',       'en-US': 'Variety'         },
  'Religioso':      { 'pt-BR': 'Religioso',        'en-US': 'Religious'       },
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useI18n() {
  const settingsStore = useSettingsStore()

  const locale = computed<Locale>(() => (settingsStore.language as Locale) ?? 'pt-BR')

  /** Traduz uma chave de interface. Retorna a chave se não encontrada. */
  function t(key: string): string {
    return UI_TRANSLATIONS[locale.value]?.[key]
      ?? UI_TRANSLATIONS['pt-BR'][key]
      ?? key
  }

  /**
   * Traduz uma chave substituindo parâmetros nomeados `{param}`.
   * Ex: tParam('manage.confirm.deleteList', { name: 'Minha TV' })
   */
  function tParam(key: string, params: Record<string, string | number>): string {
    let str = t(key)
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, String(v))
    }
    return str
  }

  /**
   * Traduz um nome de grupo de canal.
   * Grupos inteligentes (pt-BR) são traduzidos; grupos originais do M3U são retornados sem alteração.
   */
  function tGroup(groupName: string): string {
    const entry = GROUP_TRANSLATIONS[groupName]
    if (!entry) return groupName
    return entry[locale.value] ?? groupName
  }

  return { locale, t, tParam, tGroup, LOCALES }
}
