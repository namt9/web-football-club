import { signIn } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next = '/admin' } = await searchParams

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-2xl font-bold">Đăng nhập Admin</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input type="email" name="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Mật khẩu</label>
          <input type="password" name="password" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <button type="submit" className="w-full rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
          Đăng nhập
        </button>
      </form>
    </main>
  )
}
