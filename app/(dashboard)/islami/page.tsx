import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthContext } from '@/lib/auth-helpers';
import { Card } from '@/components/ui/primitives';
import {
  BookOpen,
  BookMarked,
  Clock,
  Compass,
  CircleDot,
  Heart,
  Hand,
  Sparkles,
  ScrollText,
  Moon,
  Sun,
  Droplets,
  Scale,
  Users,
  Landmark,
  CalendarDays,
  GraduationCap,
  MapPin,
  ArrowRight,
} from 'lucide-react';

const MENUS = [
  { href: '/islami/al-quran', label: 'Al-Qur\u2019an', desc: 'Baca 114 surah, tafsir Kemenag, bookmark & audio.', icon: BookOpen, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' },
  { href: '/islami/hadits', label: 'Hadits', desc: '14 kitab hadits: Bukhari, Muslim, Nasai, Tirmidzi, dan lainnya.', icon: BookMarked, tone: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30' },
  { href: '/islami/jadwal-shalat', label: 'Jadwal Shalat', desc: 'Waktu shalat Kemenag per kota, alarm & pengingat.', icon: Clock, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30' },
  { href: '/islami/kompas-kiblat', label: 'Kompas Kiblat', desc: 'Arah kiblat dari lokasi Anda.', icon: Compass, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' },
  { href: '/islami/tasbih', label: 'Tasbih', desc: 'Tasbih digital dengan penghitung & target harian.', icon: CircleDot, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30' },
  { href: '/islami/dzikir', label: 'Dzikir', desc: 'Dzikir pagi & petang dan dzikir harian.', icon: Heart, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30' },
  { href: '/islami/doa-harian', label: 'Doa Harian', desc: 'Kumpulan doa sehari-hari.', icon: Hand, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30' },
  { href: '/islami/asmaul-husna', label: 'Asmaul Husna', desc: '99 nama Allah beserta artinya.', icon: Sparkles, tone: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30' },
  { href: '/islami/kitab-maulid', label: 'Kitab Maulid', desc: 'Maulid & shalawat beserta audio.', icon: ScrollText, tone: 'bg-lime-50 text-lime-600 dark:bg-lime-900/30' },
  { href: '/islami/panduan-shalat', label: 'Panduan Shalat', desc: 'Tata cara & niat shalat fardhu dan sunnah.', icon: Moon, tone: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30' },
  { href: '/islami/panduan-puasa', label: 'Panduan Puasa', desc: 'Panduan puasa wajib & sunnah.', icon: Sun, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30' },
  { href: '/islami/thaharah', label: 'Thaharah', desc: 'Panduan bersuci: wudhu, mandi, tayammum.', icon: Droplets, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' },
  { href: '/islami/kalkulator-zakat', label: 'Kalkulator Zakat', desc: 'Hitung zakat maal, fitrah, dan profesi.', icon: Scale, tone: 'bg-green-50 text-green-600 dark:bg-green-900/30' },
  { href: '/islami/kisah-nabi', label: 'Kisah Nabi', desc: 'Kisah 25 nabi & rasul.', icon: Users, tone: 'bg-stone-50 text-stone-600 dark:bg-stone-900/30' },
  { href: '/islami/malaikat-kitab', label: 'Malaikat & Kitab', desc: 'Mengenal malaikat & kitab-kitab Allah.', icon: Landmark, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800' },
  { href: '/islami/kalender-hijriah', label: 'Kalender Hijriah', desc: 'Kalender Hijriah & hari-hari penting Islam.', icon: CalendarDays, tone: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30' },
  { href: '/islami/adab-islami', label: 'Adab Islami', desc: 'Adab sehari-hari seorang muslim.', icon: GraduationCap, tone: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30' },
  { href: '/islami/tempat-bersejarah', label: 'Tempat Bersejarah', desc: 'Tempat-tempat bersejarah Islam.', icon: MapPin, tone: 'bg-red-50 text-red-600 dark:bg-red-900/30' },
];

export default async function IslamiHubPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-ink">Islami</h1>
        <p className="text-sm text-muted">Al-Qur&apos;an, hadits, jadwal shalat, dan panduan ibadah dalam satu tempat.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {MENUS.map((m) => (
          <Link key={m.href} href={m.href} className="block">
            <Card className="!p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.tone}`}>
                  <m.icon className="h-5 w-5" />
                </span>
                <ArrowRight className="h-4 w-4 text-muted mt-3" />
              </div>
              <p className="mt-4 text-[15px] font-bold text-ink">{m.label}</p>
              <p className="mt-1 text-[13px] text-muted leading-relaxed">{m.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
