export function resolveAdminAccess({ loading, session, profile, error }) {
  if (loading) return 'loading'
  if (!session) return 'signed_out'
  if (error || !profile || !['admin', 'master'].includes(profile.role)) return 'denied'
  return 'allowed'
}
