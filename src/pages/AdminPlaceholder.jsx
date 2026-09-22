import { Construction } from 'lucide-react'
import EmptyState from '../components/ui/EmptyState'

function AdminPlaceholder({ title, description }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-4xl items-center justify-center">
      <EmptyState
        icon={Construction}
        title={title}
        description={description}
        className="w-full rounded-md border border-line bg-surface-1 px-6"
      />
    </div>
  )
}

export default AdminPlaceholder
