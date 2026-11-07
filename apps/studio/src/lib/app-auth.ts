import type { AuthenticatedUser, Payload } from 'payload'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getPayloadClient } from './payload'

export type AppUser = AuthenticatedUser & {
  collection: 'users'
  role?: 'user' | 'admin'
}

export type AppSession = { payload: Payload; user: AppUser }

export function isAppPrincipal(user: AuthenticatedUser | null | undefined): user is AppUser {
  return user?.collection === 'users'
}

export function appUserRole(user: AuthenticatedUser | null | undefined) {
  return isAppPrincipal(user) && 'role' in user ? ((user as AppUser).role ?? 'user') : 'user'
}

export async function getAppSession(requestHeaders: Headers): Promise<AppSession | null> {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: requestHeaders })
  return isAppPrincipal(user) ? { payload, user } : null
}

export async function requireAppUser() {
  const session = await getAppSession(new Headers(await headers()))
  if (!session) redirect('/login')
  return session
}

export function unauthenticatedResponse() {
  return Response.json(
    { error: 'Sign in to continue.', code: 'AUTHENTICATION_REQUIRED' },
    { status: 401 },
  )
}
