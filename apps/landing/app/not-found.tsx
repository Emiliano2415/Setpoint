import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-7xl font-black text-lime mb-4">404</p>
      <h2 className="text-2xl font-bold text-text mb-2">Página no encontrada</h2>
      <p className="text-muted mb-8 max-w-sm">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="bg-lime text-bg font-bold rounded-full px-6 py-3 text-sm"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
