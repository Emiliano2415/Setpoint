# Especificación — Acceso

Módulo del Task 17 del plan `docs/plans/2026-10-09-rediseno-frontend.md`.

| Archivo | Diseño de Stitch |
|---|---|
| `apps/dashboard/src/app/(auth)/login/page.tsx` | `docs/design/stitch/comun/acceso.html` |
| `apps/dashboard/src/app/(auth)/forgot-password/page.tsx` | `docs/design/stitch/comun/recuperar-contrasena.html` |

Ninguna de las dos pantallas lleva menú lateral ni barra superior. `apps/dashboard/src/app/(auth)/layout.tsx` no se toca.

## Estructura común

```
<div className="flex h-screen items-center justify-center bg-background p-4">
  <div className="w-full max-w-[400px]">
    <div className="rounded-xl border border-outline-variant bg-surface-container p-8">
      …contenido de la tarjeta…
    </div>
    …línea de ayuda bajo la tarjeta (solo en Acceso)…
  </div>
</div>
```

Cabecera de la tarjeta, igual en las dos:

- Marca: `<p className="text-xl font-semibold text-on-surface">Setpoint<span className="text-primary"> •</span></p>`
- Solo en Acceso, debajo: `<p className="mt-1 text-sm text-on-surface-variant">Sistema de gestión para clubes de pádel</p>`
- Título: `<h1 className="mt-6 text-xl font-semibold text-on-surface">…</h1>`

Bloque de mensaje (error o éxito), con `role="alert"` el de error y `role="status"` el de éxito:

```
<div role="alert" className="flex items-start gap-2 rounded-lg border border-error/40 bg-error/10 px-3 py-2.5 text-sm text-error">
  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
  <span>{mensaje}</span>
</div>
```

El de éxito usa `border-success/40 bg-success/10 text-success` y el icono `CheckCircle2`.

## `login/page.tsx`

### Se conserva sin cambios

- Imports de `useState`, `useRouter` y `createClient`.
- Estado: `email`, `password`, `error`, `loading` (líneas 9–12).
- `handleSubmit` completo (líneas 14–30), incluido el texto del error que fija.

### Se añade (solo presentación)

- `const [verClave, setVerClave] = useState(false)` para mostrar u ocultar la contraseña.

### Contenido de la tarjeta

Título: "Iniciar sesión". Debajo, `<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">` con:

1. `Field` (label "Correo electrónico", htmlFor `login-email`) + `Input` con `id="login-email"`, `type="email"`, `autoComplete="email"`, `required`, `value={email}`, `onChange={(e) => setEmail(e.target.value)}`, `placeholder="admin@tuclub.com"`.
2. Contraseña, sin usar `Field` porque la etiqueta comparte fila con un enlace:
   - Fila `flex items-center justify-between`: `<label htmlFor="login-password" className="text-xs font-medium text-on-surface-variant">Contraseña</label>` y `<a href="/forgot-password" className="text-xs text-on-surface-variant hover:text-primary">¿Olvidaste tu contraseña?</a>`.
   - Debajo (`mt-1.5`), un `<div className="relative">` con el `Input` (`id="login-password"`, `type={verClave ? 'text' : 'password'}`, `autoComplete="current-password"`, `required`, `value={password}`, `onChange={(e) => setPassword(e.target.value)}`, `placeholder="••••••••"`, `className="pr-10"`) y, encima a la derecha, un botón `type="button"` con `aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}`, `onClick={() => setVerClave((v) => !v)}`, clases `absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-outline hover:text-on-surface`, que pinta `EyeOff` si `verClave` y `Eye` si no (tamaño 16).
3. Si `error`: el bloque de error con `{error}`.
4. `<Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>Iniciar sesión</Button>`.

Bajo la tarjeta: `<p className="mt-4 text-center text-xs text-outline">¿Problemas para entrar? Pide acceso al propietario del club.</p>`

## `forgot-password/page.tsx`

### Se conserva sin cambios

- Imports de `useState` y `createClient`.
- Estado: `email`, `sent`, `loading` (líneas 7–9).
- `handleSubmit` completo (líneas 11–20).
- La condición actual: si `sent` es verdadero se muestra el aviso en lugar del formulario.

### Contenido de la tarjeta

Título: "Recuperar contraseña".

- Si `sent` es **falso**:
  - `<p className="mt-2 text-sm text-on-surface-variant">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>`
  - `<form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">` con `Field` (label "Correo electrónico", htmlFor `forgot-email`) + `Input` (`id="forgot-email"`, `type="email"`, `autoComplete="email"`, `required`, `value={email}`, `onChange={(e) => setEmail(e.target.value)}`, `placeholder="admin@tuclub.com"`) y `<Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>Enviar enlace</Button>`.
- Si `sent` es **verdadero**: `<div className="mt-6">` con el bloque de éxito y el texto "Si el correo existe, recibirás el enlace en unos minutos."

En ambos casos, al final de la tarjeta:

```
<a href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
  <ArrowLeft size={14} /> Volver a iniciar sesión
</a>
```

## Flujo de humo (lo ejecuta Claude)

1. `/login` sin sesión: se ve la tarjeta centrada.
2. Clave incorrecta: aparece el bloque de error y el botón vuelve a estar activo.
3. El ojo muestra y oculta la contraseña sin perder lo escrito.
4. Clave correcta: entra a `/pos`.
5. "¿Olvidaste tu contraseña?" lleva a `/forgot-password`; enviar muestra el aviso; "Volver a iniciar sesión" regresa.
