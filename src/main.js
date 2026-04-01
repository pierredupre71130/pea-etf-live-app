import './style.css'
import etfData from './etf-data.json'

const app = document.querySelector('#app')
const favoritesOptions = etfData
  .map((item) => {
    const label = `${item.ticker || item.symbol} — ${item.name}`
    return `<option value="${item.ticker || item.symbol}">${label}</option>`
  })
  .join('')

app.innerHTML = `
  <div class="app">
    <header class="header">
      <div>
        <p class="eyebrow">Suivi PEA</p>
        <h1>ETF PEA - Cours en direct</h1>
        <p class="subtitle">
          Liste des ETF compatibles PEA et leurs derniers cours (source Boursorama).
        </p>
      </div>
      <div class="controls">
        <button id="refreshBtn" type="button">Rafraîchir</button>
        <label class="toggle">
          <input id="autoRefresh" type="checkbox" checked />
          Auto 30s
        </label>
      </div>
    </header>

    <section class="panel">
      <div class="toolbar">
        <div class="search">
          <input
            id="searchInput"
            type="search"
            placeholder="Rechercher un ETF (nom, code, ISIN, ticker)"
          />
          <div class="filters">
            <label class="toggle-inline">
              <input id="tickerMode" type="checkbox" />
              Mode ticker
            </label>
            <label class="toggle-inline">
              <input id="favoritesOnly" type="checkbox" />
              Favoris seulement
            </label>
          </div>
        </div>
        <div class="meta">
          <span id="count"></span>
          <span id="updated"></span>
        </div>
      </div>

      <div class="favorites-panel">
        <div>
          <p class="favorites-title">Choisir des favoris</p>
          <p class="favorites-sub">Sélectionne un ETF puis ajoute-le à ta liste.</p>
        </div>
        <div class="favorites-actions">
          <select id="favoritePicker">
            <option value="">— Sélectionner un ETF —</option>
            ${favoritesOptions}
          </select>
          <button id="addFavorite" type="button">Ajouter</button>
          <button id="clearFavorites" type="button" class="ghost">Vider</button>
        </div>
        <div id="favoritesList" class="favorites-list"></div>
      </div>

      <div class="status" id="status"></div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ETF</th>
              <th>Code</th>
              <th>Ticker</th>
              <th>ISIN</th>
              <th>Dernier</th>
              <th>Variation</th>
              <th>Heure</th>
              <th>Lien</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </section>

    <footer class="footer">
      <p>
        Cours en direct via Boursorama. La liste ETF est préchargée.
      </p>
    </footer>
  </div>
`

const state = {
  etfs: [],
  quotes: new Map(),
  loading: false,
  error: null,
  lastUpdated: null,
  autoRefresh: true,
  favorites: []
}

const elements = {
  refreshBtn: document.querySelector('#refreshBtn'),
  autoRefresh: document.querySelector('#autoRefresh'),
  searchInput: document.querySelector('#searchInput'),
  tickerMode: document.querySelector('#tickerMode'),
  status: document.querySelector('#status'),
  tableBody: document.querySelector('#tableBody'),
  count: document.querySelector('#count'),
  updated: document.querySelector('#updated'),
  favoritesOnly: document.querySelector('#favoritesOnly'),
  favoritePicker: document.querySelector('#favoritePicker'),
  addFavorite: document.querySelector('#addFavorite'),
  clearFavorites: document.querySelector('#clearFavorites'),
  favoritesList: document.querySelector('#favoritesList')
}

const API_BASE = 'https://pea-etf-proxy.vercel.app'

const decodeEntities = (value) => {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

const formatNumber = (value, decimals = 4) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

const formatPercent = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(2).replace('.', ',')} %`
}

const formatTime = (value) => {
  if (!value) return '—'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

const FAVORITES_KEY = 'pea_etf_favorites'

const loadFavorites = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    state.favorites = raw ? JSON.parse(raw) : []
  } catch (error) {
    state.favorites = []
  }
}

const saveFavorites = () => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites))
}

const normalizeSymbol = (value) => {
  if (!value) return ''
  const direct = etfData.find((item) => item.symbol === value)
  if (direct) return direct.symbol
  const byTicker = etfData.find((item) => item.ticker === value)
  if (byTicker) return byTicker.symbol
  return value
}

const toggleFavorite = (symbol) => {
  const normalized = normalizeSymbol(symbol)
  if (state.favorites.includes(normalized)) {
    state.favorites = state.favorites.filter((item) => item !== normalized)
  } else {
    state.favorites = [...state.favorites, normalized]
  }
  saveFavorites()
  render()
}

const renderFavoritesList = () => {
  if (!elements.favoritesList) return
  if (state.favorites.length === 0) {
    elements.favoritesList.innerHTML = '<span class="empty">Aucun favori.</span>'
    return
  }

  const items = state.favorites
    .map((symbol) => {
      const match = state.etfs.find((item) => item.symbol === symbol)
      if (!match) return ''
      return `<span class="favorite-chip">${match.ticker || match.symbol} <button data-symbol="${match.symbol}">×</button></span>`
    })
    .join('')

  elements.favoritesList.innerHTML = items
  elements.favoritesList.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleFavorite(btn.dataset.symbol)
    })
  })
}

const setStatus = (message, tone = 'info') => {
  elements.status.textContent = message
  elements.status.dataset.tone = tone
}

const render = () => {
  const query = elements.searchInput.value.trim().toLowerCase()
  const tickerOnly = elements.tickerMode.checked
  const favoritesOnly = elements.favoritesOnly.checked
  const list = state.etfs.filter((item) => {
    if (favoritesOnly && !state.favorites.includes(item.symbol)) return false
    if (!query) return true
    if (tickerOnly) {
      return item.ticker.toLowerCase().startsWith(query)
    }
    return (
      item.name.toLowerCase().includes(query) ||
      item.symbol.toLowerCase().includes(query) ||
      item.ticker.toLowerCase().includes(query) ||
      item.isin.toLowerCase().includes(query)
    )
  })

  elements.count.textContent = `${list.length} ETF` +
    (query ? ` (filtré)` : '')

  elements.updated.textContent = state.lastUpdated
    ? `Mis à jour : ${new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'medium'
      }).format(state.lastUpdated)}`
    : ''

  elements.tableBody.innerHTML = list
    .map((item) => {
      const quote = state.quotes.get(item.symbol)
      const variation = quote?.variation
      const variationClass =
        variation > 0 ? 'up' : variation < 0 ? 'down' : 'flat'

      return `
        <tr>
          <td>
            <button class="favorite-btn" data-symbol="${item.symbol}" aria-label="Favori">
              ${state.favorites.includes(item.symbol) ? '★' : '☆'}
            </button>
            ${item.name}
          </td>
          <td>${item.symbol}</td>
          <td>${item.ticker || '—'}</td>
          <td>${item.isin || '—'}</td>
          <td>${quote ? formatNumber(quote.last, quote.tradingDecimals || 4) : '—'}</td>
          <td class="${variationClass}">${quote ? formatPercent(quote.variation) : '—'}</td>
          <td>${quote ? formatTime(quote.tradeDate) : '—'}</td>
          <td><a href="https://www.boursorama.com${item.href}" target="_blank" rel="noreferrer">Voir</a></td>
        </tr>
      `
    })
    .join('')

  document.querySelectorAll('.favorite-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const symbol = event.currentTarget.dataset.symbol
      toggleFavorite(symbol)
    })
  })

  renderFavoritesList()
}

const fetchPeaList = async () => {
  return etfData
}

const extractQuote = (html, symbol) => {
  const regex = /data-ist-init="([^"]+)"/g
  let match
  while ((match = regex.exec(html))) {
    const data = decodeEntities(match[1])
    try {
      const parsed = JSON.parse(data)
      if (parsed.symbol === symbol) {
        return parsed
      }
    } catch (error) {
      continue
    }
  }
  return null
}

const fetchQuote = async (symbol) => {
  const response = await fetch(`${API_BASE}/bourse/trackers/cours/${symbol}/`)
  if (!response.ok) {
    throw new Error(`Impossible de charger ${symbol}`)
  }
  const html = await response.text()
  const quote = extractQuote(html, symbol)
  if (!quote) {
    throw new Error(`Données manquantes pour ${symbol}`)
  }
  return quote
}

const fetchQuotes = async (symbols) => {
  const batchSize = 6
  for (let index = 0; index < symbols.length; index += batchSize) {
    const batch = symbols.slice(index, index + batchSize)
    const results = await Promise.allSettled(
      batch.map((symbol) => fetchQuote(symbol))
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        state.quotes.set(result.value.symbol, result.value)
      }
    })

    render()
  }
}

const loadAll = async () => {
  if (state.loading) return
  state.loading = true
  state.error = null
  setStatus(`Chargement de ${etfData.length} ETF préchargés…`)
  render()

  try {
    state.etfs = await fetchPeaList()
    const favorites = state.favorites
    const favoriteSymbols = state.etfs
      .filter((item) => favorites.includes(item.symbol))
      .map((item) => item.symbol)

    if (favoriteSymbols.length > 0) {
      setStatus(`Chargement des cours pour ${favoriteSymbols.length} favoris…`)
      render()
      await fetchQuotes(favoriteSymbols)
    }

    state.lastUpdated = new Date()
    setStatus(
      favoriteSymbols.length > 0
        ? 'Favoris à jour. Charger tout pour le reste.'
        : `Prêt. Charger les cours si besoin.`
    )
  } catch (error) {
    state.error = error
    setStatus(error.message || 'Une erreur est survenue.', 'error')
  } finally {
    state.loading = false
    render()
  }
}

let refreshTimer = null
const scheduleRefresh = () => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (!state.autoRefresh) return
  refreshTimer = setInterval(() => {
    loadAll()
  }, 30000)
}

elements.refreshBtn.addEventListener('click', () => {
  if (state.etfs.length === 0) return
  setStatus(`Chargement des cours pour ${state.etfs.length} ETF…`)
  fetchQuotes(state.etfs.map((item) => item.symbol)).then(() => {
    state.lastUpdated = new Date()
    setStatus('Cours à jour.', 'success')
  })
})

elements.autoRefresh.addEventListener('change', (event) => {
  state.autoRefresh = event.target.checked
  scheduleRefresh()
})

elements.searchInput.addEventListener('input', () => render())
elements.tickerMode.addEventListener('change', () => render())
elements.favoritesOnly.addEventListener('change', () => render())

loadFavorites()
loadAll()
scheduleRefresh()

if (elements.addFavorite) {
  elements.addFavorite.addEventListener('click', () => {
    const value = elements.favoritePicker.value
    if (!value) return
    toggleFavorite(value)
    elements.favoritePicker.value = ''
  })
}

if (elements.clearFavorites) {
  elements.clearFavorites.addEventListener('click', () => {
    state.favorites = []
    saveFavorites()
    render()
  })
}
