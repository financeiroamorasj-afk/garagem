/**
 * DataTable — tabela semântica com estados de carregamento/vazio e ações por linha.
 * columns: [{ key, header, align?: 'left'|'right', dataType?: boolean, render? }]
 */
import EmptyState from './EmptyState'
import Spinner from './Spinner'

function DataTable({
  columns,
  rows,
  getRowKey = (row) => row.id,
  renderAction,
  actionLabel = 'Ações',
  loading = false,
  emptyTitle = 'Nenhum item encontrado',
  emptyDescription,
  emptyIcon,
  onRowActivate,
  caption,
  className = '',
  ...props
}) {
  const columnCount = columns.length + (renderAction ? 1 : 0)

  function activateRow(event, row) {
    if (!onRowActivate) return
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
    if (event.type === 'keydown') event.preventDefault()
    onRowActivate(row)
  }

  return (
    <div className={['overflow-hidden rounded-md border border-line bg-surface-1 sm:overflow-x-auto', className].filter(Boolean).join(' ')} {...props}>
      <div className="sm:hidden">
        {loading ? (
          <div className="px-4 py-12 text-center">
            <span className="inline-flex items-center gap-3 text-body text-steel"><Spinner /> Carregando dados</span>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} className="px-6" />
        ) : rows.map((row) => (
          <article
            key={getRowKey(row)}
            tabIndex={onRowActivate ? 0 : undefined}
            onClick={onRowActivate ? (event) => activateRow(event, row) : undefined}
            onKeyDown={onRowActivate ? (event) => activateRow(event, row) : undefined}
            className={[
              'divide-y divide-line border-b border-line px-4 py-2 last:border-b-0',
              onRowActivate ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper' : '',
            ].filter(Boolean).join(' ')}
          >
            {columns.map((column) => (
              <div key={column.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 py-2.5">
                <span className="text-label text-steel">{column.header}</span>
                <span className={['min-w-0 break-words text-right text-body-sm text-warm-white', column.dataType ? 'text-data' : ''].filter(Boolean).join(' ')}>
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </span>
              </div>
            ))}
            {renderAction && (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                <span className="text-label text-steel">{actionLabel}</span>
                <span className="flex min-w-0 flex-wrap justify-end gap-2">{renderAction(row)}</span>
              </div>
            )}
          </article>
        ))}
      </div>
      <table className="hidden w-full min-w-max border-collapse sm:table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  'px-4 py-3 text-label text-steel',
                  column.align === 'right' ? 'text-right' : 'text-left',
                ].join(' ')}
              >
                {column.header}
              </th>
            ))}
            {renderAction && <th scope="col" className="px-4 py-3 text-right text-label text-steel">{actionLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-12 text-center">
                <span className="inline-flex items-center gap-3 text-body text-steel"><Spinner /> Carregando dados</span>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount}>
                <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} className="px-6" />
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr
              key={getRowKey(row)}
              tabIndex={onRowActivate ? 0 : undefined}
              onClick={onRowActivate ? (event) => activateRow(event, row) : undefined}
              onKeyDown={onRowActivate ? (event) => activateRow(event, row) : undefined}
              className={[
                'border-b border-line last:border-b-0',
                onRowActivate ? 'cursor-pointer transition-colors duration-100 ease-brand hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper' : '',
              ].filter(Boolean).join(' ')}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    'px-4 py-3 text-body-sm text-warm-white',
                    column.dataType ? 'text-data' : '',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  ].filter(Boolean).join(' ')}
                >
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </td>
              ))}
              {renderAction && <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>{renderAction(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default DataTable
