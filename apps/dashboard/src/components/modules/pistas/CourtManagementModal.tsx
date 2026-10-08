'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAllPistas, updatePista, createPista } from '@/lib/supabase/queries/pistas'
import type { PistaRow } from '@/lib/supabase/queries/pistas'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'

const TIPOS = ['Indoor', 'Outdoor', 'Cubierta', 'Semi-cubierta']

interface Props {
  onClose: () => void
  onRefresh: () => void
}

export function CourtManagementModal({ onClose, onRefresh }: Props) {
  const clubId = useAppStore((s) => s.clubId)
  const [pistas, setPistas] = useState<PistaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editingNotaId, setEditingNotaId] = useState<string | null>(null)
  const [editNota, setEditNota] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newTipo, setNewTipo] = useState('Indoor')
  const [saving, setSaving] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  async function load() {
    if (!clubId) return
    setLoading(true)
    try {
      const data = await getAllPistas(supabase, clubId)
      setPistas(data)
    } catch {
      toast.error('Error al cargar canchas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clubId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleActiva(p: PistaRow) {
    try {
      await updatePista(supabase, p.id, { activa: !p.activa })
      setPistas((prev) => prev.map((x) => x.id === p.id ? { ...x, activa: !x.activa } : x))
      onRefresh()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function toggleMantenimiento(p: PistaRow) {
    const next = !p.en_mantenimiento
    try {
      await updatePista(supabase, p.id, { en_mantenimiento: next, nota_mantenimiento: next ? (p.nota_mantenimiento ?? null) : null })
      setPistas((prev) => prev.map((x) => x.id === p.id ? { ...x, en_mantenimiento: next } : x))
      if (next) { setEditingNotaId(p.id); setEditNota(p.nota_mantenimiento ?? '') }
      onRefresh()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function saveNota(p: PistaRow) {
    try {
      await updatePista(supabase, p.id, { nota_mantenimiento: editNota.trim() || null })
      setPistas((prev) => prev.map((x) => x.id === p.id ? { ...x, nota_mantenimiento: editNota.trim() || null } : x))
      setEditingNotaId(null)
      toast.success('Nota guardada')
      onRefresh()
    } catch {
      toast.error('Error al guardar nota')
    }
  }

  async function saveNombre(p: PistaRow) {
    if (!editNombre.trim()) { toast.error('El nombre no puede estar vacío'); return }
    try {
      await updatePista(supabase, p.id, { nombre: editNombre.trim() })
      setPistas((prev) => prev.map((x) => x.id === p.id ? { ...x, nombre: editNombre.trim() } : x))
      setEditingId(null)
      toast.success('Nombre actualizado')
      onRefresh()
    } catch {
      toast.error('Error al actualizar nombre')
    }
  }

  async function moveOrden(p: PistaRow, dir: 'up' | 'down') {
    const idx = pistas.findIndex((x) => x.id === p.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= pistas.length) return
    const swap = pistas[swapIdx]
    try {
      await Promise.all([
        updatePista(supabase, p.id, { orden: swap.orden }),
        updatePista(supabase, swap.id, { orden: p.orden }),
      ])
      const updated = [...pistas]
      updated[idx] = { ...p, orden: swap.orden }
      updated[swapIdx] = { ...swap, orden: p.orden }
      updated.sort((a, b) => a.orden - b.orden)
      setPistas(updated)
      onRefresh()
    } catch {
      toast.error('Error al reordenar')
    }
  }

  async function handleAdd() {
    if (!newNombre.trim()) { toast.error('Ingresa un nombre para la cancha'); return }
    setSaving(true)
    try {
      const maxOrden = pistas.length > 0 ? Math.max(...pistas.map((p) => p.orden)) + 1 : 1
      await createPista(supabase, clubId ?? '', { nombre: newNombre.trim(), tipo: newTipo, orden: maxOrden })
      toast.success('Cancha agregada')
      setNewNombre('')
      setShowAddForm(false)
      await load()
      onRefresh()
    } catch {
      toast.error('Error al agregar cancha')
    } finally {
      setSaving(false)
    }
  }

  const activeCount = pistas.filter((p) => p.activa).length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-bg2)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px',
        width: '540px',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Gestión de Canchas
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
              {activeCount} activas · {pistas.length} total
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px', background: 'var(--color-lime)', color: 'var(--color-bg)',
                border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Plus size={12} /> Agregar
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border-subtle)', background: 'rgba(108,242,13,0.03)', flexShrink: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <input
                type="text"
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                placeholder="Nombre de la cancha (ej: Pista 5)"
                style={inputStyle}
                autoFocus
              />
              <select value={newTipo} onChange={(e) => setNewTipo(e.target.value)} style={inputStyle}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddForm(false)} style={smallCancelBtn}>Cancelar</button>
              <button onClick={handleAdd} disabled={saving} style={smallConfirmBtn}>
                {saving ? 'Guardando...' : 'Agregar Cancha'}
              </button>
            </div>
          </div>
        )}

        {/* Court list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
              Cargando...
            </div>
          ) : (
            pistas.map((p, idx) => (
              <div key={p.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 24px',
                  borderBottom: p.en_mantenimiento ? undefined : '1px solid var(--color-border-subtle)',
                  opacity: p.activa ? 1 : 0.5,
                  transition: 'opacity 0.15s',
                }}
              >
                {/* Orden arrows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button
                    onClick={() => moveOrden(p, 'up')}
                    disabled={idx === 0}
                    style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--color-border)' : 'var(--color-muted)', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px' }}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveOrden(p, 'down')}
                    disabled={idx === pistas.length - 1}
                    style={{ background: 'none', border: 'none', color: idx === pistas.length - 1 ? 'var(--color-border)' : 'var(--color-muted)', cursor: idx === pistas.length - 1 ? 'default' : 'pointer', padding: '1px' }}
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>

                {/* Toggle activa */}
                <div
                  onClick={() => toggleActiva(p)}
                  style={{
                    width: '32px', height: '18px', borderRadius: '9px',
                    background: p.activa ? 'var(--color-lime)' : 'var(--color-border)',
                    position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: p.activa ? '16px' : '2px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: p.activa ? 'var(--color-bg)' : 'var(--color-muted)',
                    transition: 'left 0.2s',
                  }} />
                </div>

                {/* Nombre editable */}
                {editingId === p.id ? (
                  <div style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveNombre(p); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus
                      style={{
                        flex: 1, padding: '4px 8px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-lime)',
                        borderRadius: '6px', color: 'var(--color-text)',
                        fontSize: '13px', fontWeight: 600, outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={() => saveNombre(p)} style={{ ...smallConfirmBtn, padding: '4px 10px', fontSize: '11px' }}>✓</button>
                    <button onClick={() => setEditingId(null)} style={{ ...smallCancelBtn, padding: '4px 10px', fontSize: '11px' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ flex: 1 }}>
                    <div
                      onClick={() => { setEditingId(p.id); setEditNombre(p.nombre) }}
                      style={{
                        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        padding: '4px 8px', borderRadius: '6px',
                        border: '1px solid transparent',
                        transition: 'border-color 0.15s', display: 'inline-block',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                      title="Clic para editar nombre"
                    >
                      {p.nombre}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-muted-dim)', paddingLeft: '8px' }}>{p.tipo}</div>
                  </div>
                )}

                {/* Mantenimiento toggle */}
                <div
                  onClick={() => toggleMantenimiento(p)}
                  title="Mantenimiento"
                  style={{
                    width: '32px', height: '18px', borderRadius: '9px',
                    background: p.en_mantenimiento ? '#EAB308' : 'var(--color-border)',
                    position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: p.en_mantenimiento ? '16px' : '2px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: p.en_mantenimiento ? 'var(--color-bg)' : 'var(--color-muted)',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: '9px', color: 'var(--color-muted-dim)', width: '18px', textAlign: 'center', flexShrink: 0 }}>🔧</span>

                {/* Estado badge */}
                <span style={{
                  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                  color: p.en_mantenimiento ? '#EAB308' : p.activa ? 'var(--color-lime)' : 'var(--color-muted)',
                  flexShrink: 0, minWidth: '64px', textAlign: 'right',
                }}>
                  {p.en_mantenimiento ? '🔧 Mant.' : p.activa ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              {/* Nota mantenimiento */}
              {p.en_mantenimiento && (
                <div style={{ padding: '0 24px 10px 76px' }}>
                  {editingNotaId === p.id ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={editNota}
                        onChange={(e) => setEditNota(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveNota(p); if (e.key === 'Escape') setEditingNotaId(null) }}
                        placeholder="Describe el mantenimiento..."
                        autoFocus
                        style={{ ...inputStyle, fontSize: '12px', padding: '5px 8px' }}
                      />
                      <button onClick={() => saveNota(p)} style={{ ...smallConfirmBtn, padding: '4px 10px', fontSize: '11px' }}>✓</button>
                      <button onClick={() => setEditingNotaId(null)} style={{ ...smallCancelBtn, padding: '4px 10px', fontSize: '11px' }}>✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setEditingNotaId(p.id); setEditNota(p.nota_mantenimiento ?? '') }}
                      style={{
                        fontSize: '11px', color: p.nota_mantenimiento ? '#EAB308' : 'var(--color-muted-dim)',
                        cursor: 'pointer', padding: '3px 6px', borderRadius: '4px',
                        border: '1px dashed var(--color-border)',
                        display: 'inline-block',
                      }}
                    >
                      {p.nota_mantenimiento ?? 'Agregar nota de mantenimiento...'}
                    </div>
                  )}
                </div>
              )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px', color: 'var(--color-text)',
  fontSize: '13px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
}

const smallConfirmBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--color-lime)', border: 'none', borderRadius: '6px',
  color: 'var(--color-bg)', fontSize: '12px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

const smallCancelBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)', borderRadius: '6px',
  color: 'var(--color-muted)', fontSize: '12px', fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}
