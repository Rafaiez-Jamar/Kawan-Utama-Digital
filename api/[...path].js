import { Readable } from 'node:stream'

const maximumRequestBytes = 4 * 1024 * 1024

function respondError(response, status, message) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify({ error: message }))
}

async function readRequestBody(request) {
  if (request.body !== undefined) {
    if (Buffer.isBuffer(request.body)) return request.body
    if (typeof request.body === 'string') return Buffer.from(request.body)
    return Buffer.from(JSON.stringify(request.body))
  }

  const chunks = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > maximumRequestBytes) {
      const error = new Error('Request body exceeds proxy limit.')
      error.status = 413
      throw error
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export default async function handler(request, response) {
  const apiUrl = process.env.LOCAL_API_URL?.trim().replace(/\/+$/, '')
  const proxySecret = process.env.API_PROXY_SECRET
  if (!apiUrl || !proxySecret) {
    respondError(response, 503, 'Proxy API belum dikonfigurasi.')
    return
  }

  let target
  try {
    target = new URL(apiUrl)
    if (target.protocol !== 'https:') throw new Error('HTTPS required')
  } catch {
    respondError(response, 500, 'URL API tunnel harus menggunakan HTTPS yang valid.')
    return
  }

  const incomingUrl = new URL(request.url ?? '/', 'https://vercel.invalid')
  const apiPath = incomingUrl.pathname || '/api'
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || ['host', 'connection', 'content-length', 'transfer-encoding', 'x-api-proxy-secret'].includes(name.toLowerCase())) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  headers.set('x-api-proxy-secret', proxySecret)
  headers.set('ngrok-skip-browser-warning', 'true')
  const forwardedFor = request.headers['x-forwarded-for']
  const clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]?.trim()
  if (clientIp) headers.set('x-proxy-client-ip', clientIp)

  try {
    const method = request.method ?? 'GET'
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request)
    if (body && body.byteLength > maximumRequestBytes) {
      respondError(response, 413, 'Request terlalu besar untuk proxy Vercel (maksimal 4 MB).')
      return
    }
    const upstream = await fetch(`${target.origin}${target.pathname.replace(/\/+$/, '')}${apiPath}${incomingUrl.search}`, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    })

    if (upstream.headers.has('ngrok-error-code')) {
      respondError(response, 502, 'Ngrok menampilkan halaman peringatan. Pastikan tunnel mengizinkan request API.')
      return
    }

    response.statusCode = upstream.status
    upstream.headers.forEach((value, name) => {
      if (!['connection', 'content-encoding', 'content-length', 'keep-alive', 'transfer-encoding'].includes(name.toLowerCase()) && name.toLowerCase() !== 'set-cookie') {
        response.setHeader(name, value)
      }
    })
    const setCookies = upstream.headers.getSetCookie()
    if (setCookies.length) response.setHeader('set-cookie', setCookies)
    if (!upstream.body || method === 'HEAD') {
      response.end()
      return
    }
    Readable.fromWeb(upstream.body).pipe(response)
  } catch (error) {
    console.error('Vercel API proxy request failed:', error)
    if (!response.headersSent) {
      const status = error?.status === 413 ? 413 : error?.name === 'TimeoutError' ? 504 : 502
      respondError(response, status, status === 413 ? 'Request terlalu besar untuk proxy Vercel (maksimal 4 MB).' : 'API lokal tidak dapat dijangkau melalui tunnel.')
    } else {
      response.destroy(error)
    }
  }
}
