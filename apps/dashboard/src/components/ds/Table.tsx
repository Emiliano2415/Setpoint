'use client'

import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  /** Ancho CSS opcional, p. ej. "120px" o "20%" */
  width?: string
  render: (row: T) => ReactNode
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  selectedKey?: string
  /** Se muestra en una sola fila cuando no hay datos */
  empty?: ReactNode
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty,
}: TableProps<T>) {
  return (
    <div className="overflow-auto rounded-lg border border-outline-variant bg-surface-container">
      <table className="w-full border-collapse text-sm">
        <colgroup>
          {columns.map((c) =>
            c.width ? (
              <col key={c.key} style={{ width: c.width }} />
            ) : (
              <col key={c.key} />
            ),
          )}
        </colgroup>
        <thead className="sticky top-0 bg-surface-container">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`h-10 border-b border-outline-variant px-4 text-xs font-medium uppercase tracking-wide text-outline ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row)
              const selected = key === selectedKey
              const rowClass = [
                'border-b border-outline-variant last:border-b-0 transition-colors',
                selected ? 'bg-primary/10' : 'hover:bg-surface-container-highest',
                onRowClick ? 'cursor-pointer' : '',
              ].join(' ')
              return (
                <tr
                  key={key}
                  className={rowClass}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`h-10 px-4 text-on-surface ${
                        c.align === 'right' ? 'text-right tabular-nums' : ''
                      }`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
