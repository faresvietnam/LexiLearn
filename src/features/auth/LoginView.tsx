import {LogIn} from 'lucide-react';
import {useAuth} from './AuthProvider';

export function LoginView() {
  const {status, error, signInWithGoogle} = useAuth();
  if (status === 'loading') return <main className="min-h-screen grid place-items-center text-slate-600">Đang kiểm tra phiên đăng nhập…</main>;
  if (status === 'config-error') return <main className="min-h-screen grid place-items-center p-6 text-center text-rose-700">Thiếu cấu hình Supabase trong `.env.local`.</main>;
  return <main className="min-h-screen grid place-items-center bg-slate-50 p-6"><section className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl border border-slate-200 space-y-5"><img src="/lexilearn-logo.svg" alt="LexiLearn" className="mx-auto h-16 w-16 rounded-2xl shadow-md"/><div><h1 className="text-2xl font-extrabold text-slate-900">LexiLearn</h1><p className="mt-2 text-sm text-slate-500">Đăng nhập để lưu tiến độ học của bạn.</p></div><button onClick={() => void signInWithGoogle()} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-700 flex items-center justify-center gap-2"><LogIn className="w-4 h-4"/>Đăng nhập với Google</button>{error && <p className="text-sm text-rose-700">{error}</p>}</section></main>;
}
