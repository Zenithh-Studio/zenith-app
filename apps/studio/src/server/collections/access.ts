import type { Access, AuthenticatedUser } from 'payload'

export function isAppUser(user: AuthenticatedUser | null | undefined) {
  return user?.collection === 'users'
}

export function isAppAdmin(user: AuthenticatedUser | null | undefined) {
  return (
    isAppUser(user) &&
    'role' in user &&
    (user as AuthenticatedUser & { role?: string }).role === 'admin'
  )
}

export function isPayloadAdmin(user: AuthenticatedUser | null | undefined) {
  return user?.collection === 'admins'
}

export function canWriteWorkflowRuntime(req: { context?: Record<string, unknown> }) {
  return req.context?.workflowRuntime === true
}

export function workflowRuntimeAccess(args: Parameters<Access>[0]) {
  if (
    !canWriteWorkflowRuntime(args.req) &&
    !isAppAdmin(args.req.user) &&
    !isPayloadAdmin(args.req.user)
  )
    return false
  return ownerAccess(args)
}

export const ownerCreateAccess: Access = ({ req }) => isAppUser(req.user)

export const studioRuntimeOwnerAccess: Access = (args) => {
  if (
    args.req.context?.studioRuntime !== true &&
    !isAppAdmin(args.req.user) &&
    !isPayloadAdmin(args.req.user)
  )
    return false
  return ownerAccess(args)
}

export function mediaServiceWriteAccess({ req }: Parameters<Access>[0]) {
  if (isAppAdmin(req.user) || isPayloadAdmin(req.user)) return true
  return isAppUser(req.user) && req.context?.assetService === true
}

export const appUserOrAdmin: Access = ({ req }) => isAppUser(req.user)

export const ownerAccess: Access = ({ req }) => {
  if (isAppAdmin(req.user) || isPayloadAdmin(req.user)) return true
  if (!isAppUser(req.user)) return false
  return { owner: { equals: req.user.id } }
}

export const adminOnly: Access = ({ req }) => isAppAdmin(req.user) || isPayloadAdmin(req.user)

export function setDocumentOwner<T extends Record<string, unknown>>({
  data,
  req,
}: {
  data: T
  req: { user?: AuthenticatedUser | null }
}) {
  if (!isAppUser(req.user)) return data
  return { ...data, owner: req.user.id }
}
