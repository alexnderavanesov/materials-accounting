export function applicationOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN
  if (configured) {
    const url = new URL(configured)
    if (
      url.protocol !== 'https:' &&
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error(
        'Для общего сервера APP_ORIGIN должен использовать HTTPS.',
      )
    return url.origin
  }
  const url = new URL(request.url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Настройте APP_ORIGIN с HTTPS для доступа через интернет.')
  return url.origin
}

// Access no longer depends on a session. Keep same-origin checks for writes.
export function checkWorkspaceOrigin(request: Request) {
  const origin = applicationOrigin(request)
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== origin
  )
    throw new Error('Запрос с другого сайта отклонён.')
}

export async function workspaceResponse(
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  try {
    checkWorkspaceOrigin(request)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Запрос отклонён.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return handler(request)
}
