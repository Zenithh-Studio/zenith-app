import { describe, expect, it } from 'vitest'
import { setDocumentOwner } from './access'

describe('collection ownership hooks', () => {
  it('assigns app admin records to that admin while ignoring a submitted owner', () => {
    const data = setDocumentOwner({
      data: { owner: 'another-user', name: 'Workflow' },
      req: {
        user: { id: 'admin-user', collection: 'users', role: 'admin' } as never,
      },
    })

    expect(data).toEqual({ owner: 'admin-user', name: 'Workflow' })
  })

  it('assigns ordinary app user records to the authenticated user', () => {
    const data = setDocumentOwner({
      data: { owner: 'someone-else' },
      req: { user: { id: 'app-user', collection: 'users', role: 'user' } as never },
    })

    expect(data.owner).toBe('app-user')
  })

  it('leaves non app user records to their trusted caller', () => {
    const record = { owner: 'migration-owner' }
    const data = setDocumentOwner({
      data: record,
      req: { user: { id: 'payload-admin', collection: 'admins' } as never },
    })

    expect(data).toBe(record)
  })
})
