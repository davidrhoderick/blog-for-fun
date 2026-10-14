import { data } from 'react-router'

export const requireSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  const requestOrigin = new URL(request.url).origin

  if (origin !== requestOrigin) {
    throw data('Invalid request origin', { status: 403 })
  }
}
