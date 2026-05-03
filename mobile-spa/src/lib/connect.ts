const STORAGE_URL   = 'tf_mobile_url'
const STORAGE_TOKEN = 'tf_mobile_token'

export function getConnection() {
  return {
    url:   localStorage.getItem(STORAGE_URL)   ?? '',
    token: localStorage.getItem(STORAGE_TOKEN) ?? '',
  }
}

export function saveConnection(url: string, token: string) {
  localStorage.setItem(STORAGE_URL,   url.replace(/\/$/, ''))
  localStorage.setItem(STORAGE_TOKEN, token)
}

export function clearConnection() {
  localStorage.removeItem(STORAGE_URL)
  localStorage.removeItem(STORAGE_TOKEN)
}

export function isConnected(): boolean {
  const { url, token } = getConnection()
  return url.length > 0 && token.length >= 32
}
