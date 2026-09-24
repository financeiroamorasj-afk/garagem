export function homeRouteForRole(role) {
  if (role === 'barbeiro') return '/barber/dashboard'
  if (role === 'recepcao' || role === 'reception') return '/reception/board'
  return '/admin/dashboard'
}
