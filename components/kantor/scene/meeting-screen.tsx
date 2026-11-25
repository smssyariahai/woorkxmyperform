/**
 * WOORK VIRTUAL OFFICE — Smart Meeting Room Display + Papan Jadwal Salat.
 *
 * Monitor ruang meeting dan papan jadwal musala dirender sebagai
 * CanvasTexture pada bidang 3D (bukan iframe / overlay DOM): stabil di
 * semua kamera, tidak distorsi bila rasio bidang = rasio canvas, dan
 * terlihat "menyala" lewat meshBasicMaterial (unlit).
 *
 * Slideshow monitor memakai DATA NYATA dari GET /api/kantor/briefing/
 * content (Meeting, Announcement, CalendarEvent, TalTask, Agent).
 * Bagian tanpa data menampilkan "belum tersedia" — TIDAK ADA angka
 * karangan. Indeks slide diturunkan dari jam dinding (6 detik/slide),
 * jadi semua client menampilkan slide yang sama. Presentation Mode:
 * bila briefing aktif, slide pertama = MORNING BRIEFING.
 *
 * Papan salat memakai GET /api/kantor/prayer/schedule (jadwal hari ini +
 * salat berikutnya + kiblat). Jam + countdown dihitung LIVE dari jam
 * browser (zona perusahaan via Intl) — TIDAK ADA waktu hardcode.
 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BriefingContent } from '@/lib/kantor/briefing';
import type { NextPrayer, PrayerScheduleDay } from '@/lib/kantor/prayer';

// ---------------------------------------------------------------------------
// Kanvas
// ---------------------------------------------------------------------------

/** Tekstur statis sekali gambar (mihrab, kaligrafi, panah kiblat). */
export function makeStaticTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Tekstur yang digambar ulang berkala (slideshow + jam). `draw` selalu
 * versi terbaru (disimpan di ref) sehingga interval tidak perlu
 * di-restart saat data berubah; `deps` memicu gambar ulang segera.
 */
function useLiveTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, now: Date) => void,
  deps: unknown[],
): THREE.CanvasTexture {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // Simpan kanvas di tekstur (dipakai tick di bawah).
    (tex as THREE.CanvasTexture & { __canvas?: HTMLCanvasElement }).__canvas = canvas;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
  useEffect(() => {
    const canvas = (texture as THREE.CanvasTexture & { __canvas?: HTMLCanvasElement }).__canvas;
    if (!canvas) return;
    const tick = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawRef.current(ctx, new Date());
      texture.needsUpdate = true;
    };
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, ...deps]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

const INK = '#f4efe6';
const MUTED = '#9fb3a8';
const GOLD = '#e9c46a';
const RED = '#d9534f';

function slideBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#15201c');
  g.addColorStop(1, '#1e3a2f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, w, 6);
}

// ---------------------------------------------------------------------------
// Monitor ruang meeting — slideshow
// ---------------------------------------------------------------------------

const SLIDE_MS = 6000;

interface Slide {
  title: string;
  lines: string[];
  footer: string;
}

function buildSlides(
  content: BriefingContent | null,
  briefingActive: boolean,
  leaderName: string | null,
): Slide[] {
  const slides: Slide[] = [];
  if (briefingActive) {
    slides.push({
      title: 'MORNING BRIEFING',
      lines: [
        content?.dateLong ?? '',
        content ? `Mulai ${content.startTime} ${content.timezone} · ${content.durationMinutes} menit` : 'Mulai 08.00 Asia/Jakarta',
        `Leader: ${leaderName ?? '—'}`,
        content ? `${content.agents.activeCount} agent aktif` : '',
      ].filter(Boolean),
      footer: 'WOORK · woork.id',
    });
  }
  slides.push({
    title: 'WOORK',
    lines: ['WORK SMARTER WITH WOORK', 'Satu platform, semua pekerjaan Anda.'],
    footer: 'woork.id',
  });
  slides.push({
    title: 'Good Morning, WOORK Team!',
    lines: [
      content?.dateLong ?? '',
      content ? `Briefing ${content.startTime} ${content.timezone} · ${content.durationMinutes} menit` : 'Morning Briefing 08.00 WIB',
    ].filter(Boolean),
    footer: 'WOORK · woork.id',
  });
  const agenda: string[] = [];
  if (content) {
    if (content.overview.available) {
      for (const m of content.overview.meetingsToday.slice(0, 3)) agenda.push(`${m.time} — ${m.title}`);
      if (content.overview.announcement) agenda.push(`Pengumuman: ${content.overview.announcement.title}`);
    }
    if (agenda.length === 0) agenda.push(content.overview.available ? 'Tidak ada agenda hari ini' : 'Agenda belum tersedia');
  } else agenda.push('Memuat agenda…');
  slides.push({ title: 'Agenda Briefing', lines: agenda, footer: 'WOORK · woork.id' });
  const agents: string[] = [];
  if (content) {
    if (content.agents.available) {
      agents.push(`${content.agents.activeCount} agent aktif · ${content.agents.runningCount} menjalankan tugas`);
      for (const name of content.agents.runningAgents.slice(0, 3)) agents.push(`• ${name}`);
      if (content.agents.unavailableCount > 0) agents.push(`${content.agents.unavailableCount} agent tidak tersedia`);
    } else agents.push('Data agent belum tersedia');
  } else agents.push('Memuat data agent…');
  slides.push({ title: 'AI-Agent Activity', lines: agents, footer: 'WOORK · woork.id' });
  const calendar: string[] = [];
  if (content) {
    if (content.calendar.available) {
      for (const e of content.calendar.events.slice(0, 4)) calendar.push(`${e.time} — ${e.title}`);
      if (calendar.length === 0) calendar.push('Tidak ada event hari ini');
    } else calendar.push('Kalender hari ini belum tersedia');
  } else calendar.push('Memuat kalender…');
  slides.push({ title: 'Work Calendar — Hari Ini', lines: calendar, footer: 'WOORK · woork.id' });
  const tasks: string[] = [];
  if (content) {
    if (content.tasks.available) {
      tasks.push(`${content.tasks.total} tugas · ${content.tasks.done} selesai · ${content.tasks.pending} berjalan`);
      for (const o of content.tasks.overdue.slice(0, 3)) tasks.push(`Terlambat: ${o.title}`);
    } else tasks.push('Data tugas belum tersedia');
  } else tasks.push('Memuat data tugas…');
  slides.push({ title: 'Task & Project', lines: tasks, footer: 'WOORK · woork.id' });
  return slides;
}

export interface MeetingScreenProps {
  content: BriefingContent | null;
  briefingActive: boolean;
  leaderName: string | null;
}

/**
 * Bidang layar monitor (1,88 × 1,03 — sama dengan permukaan TV yang
 * sudah ada). Diposisikan parent tepat di depan layar TV; material
 * unlit (toneMapped false) supaya terlihat menyala seperti layar aktif.
 */
export function MeetingScreen({ content, briefingActive, leaderName }: MeetingScreenProps) {
  const texture = useLiveTexture(760, 416, (ctx, now) => {
    const w = 760;
    const h = 416;
    const slides = buildSlides(content, briefingActive, leaderName);
    const index = Math.floor(now.getTime() / SLIDE_MS) % slides.length;
    const slide = slides[index];
    // Fade-in 600 ms tiap pergantian slide.
    const alpha = Math.min(1, (now.getTime() % SLIDE_MS) / 600);
    slideBackground(ctx, w, h);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = GOLD;
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const titleLines = wrapLines(ctx, slide.title, w - 64);
    titleLines.forEach((line, i) => ctx.fillText(line, 32, 28 + i * 40));
    ctx.fillStyle = INK;
    ctx.font = '24px system-ui, sans-serif';
    let y = 28 + titleLines.length * 40 + 18;
    for (const raw of slide.lines) {
      for (const line of wrapLines(ctx, raw, w - 64)) {
        if (y > h - 64) break;
        ctx.fillText(line, 32, y);
        y += 32;
      }
    }
    ctx.fillStyle = MUTED;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(slide.footer, 32, h - 52);
    // Progress bar + titik slide.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(32, h - 26, w - 64, 4);
    ctx.fillStyle = GOLD;
    ctx.fillRect(32, h - 26, ((w - 64) * (now.getTime() % SLIDE_MS)) / SLIDE_MS, 4);
    slides.forEach((_, i) => {
      ctx.beginPath();
      ctx.arc(w - 32 - i * 18, h - 40, i === index ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === index ? GOLD : 'rgba(255,255,255,0.4)';
      ctx.fill();
    });
    ctx.restore();
  }, [content, briefingActive, leaderName]);
  return (
    <mesh>
      <planeGeometry args={[1.88, 1.03]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Papan jadwal salat (musala)
// ---------------------------------------------------------------------------

export interface PrayerBoardData {
  schedule: PrayerScheduleDay | null;
  next: NextPrayer | null;
  qibla: number;
  source: string;
  cityName: string | null;
  timezone: string;
}

function countdownLive(scheduledAtIso: string | null, now: Date): string {
  if (!scheduledAtIso) return '—';
  const diffMs = new Date(scheduledAtIso).getTime() - now.getTime();
  if (diffMs <= 0) return 'tiba';
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} j ${m} mnt`;
  if (m > 0) return `${m} mnt ${s} dtk`;
  return `${s} dtk`;
}

function clockInZone(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return now.toTimeString().slice(0, 8);
  }
}

const PRAYER_ROWS: { key: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'; label: string; name: NextPrayer['prayerName'] }[] = [
  { key: 'fajr', label: 'Subuh', name: 'subuh' },
  { key: 'dhuhr', label: 'Zuhur', name: 'dzuhur' },
  { key: 'asr', label: 'Asar', name: 'ashar' },
  { key: 'maghrib', label: 'Magrib', name: 'maghrib' },
  { key: 'isha', label: 'Isya', name: 'isya' },
];

/**
 * Papan jadwal salat (1,7 × 1,05). Menampilkan jadwal hari ini dari API,
 * jam berjalan WIB + countdown salat berikutnya (dihitung live), lokasi,
 * sumber/metode, dan arah kiblat. Bila jadwal belum termuat, tampilkan
 * "Memuat jadwal…" — bukan angka contoh.
 */
export function PrayerBoard({ schedule, next, qibla, source, cityName, timezone }: PrayerBoardData) {
  const texture = useLiveTexture(680, 420, (ctx, now) => {
    const w = 680;
    const h = 420;
    slideBackground(ctx, w, h);
    ctx.fillStyle = GOLD;
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('JADWAL SHALAT HARI INI', 28, 22);
    ctx.fillStyle = MUTED;
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(schedule ? `${schedule.date} · ${cityName ?? schedule.cityName ?? ''}` : 'Memuat jadwal…', 28, 62);
    ctx.fillStyle = INK;
    ctx.font = '700 34px system-ui, monospace';
    ctx.fillText(`${clockInZone(now, timezone)} WIB`, 28, 92);
    if (!schedule) {
      ctx.fillStyle = MUTED;
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('Memuat jadwal salat…', 28, 150);
    } else {
      let y = 148;
      for (const row of PRAYER_ROWS) {
        const isNext = next?.prayerName === row.name;
        if (isNext) {
          ctx.fillStyle = 'rgba(233,196,106,0.16)';
          ctx.fillRect(20, y - 6, w - 40, 38);
        }
        ctx.fillStyle = isNext ? GOLD : INK;
        ctx.font = `${isNext ? '700' : '400'} 26px system-ui, sans-serif`;
        ctx.fillText(row.label, 28, y);
        ctx.font = `700 26px system-ui, monospace`;
        ctx.fillText(`${schedule[row.key]} WIB`, w - 28 - ctx.measureText(`${schedule[row.key]} WIB`).width, y);
        y += 40;
      }
      ctx.fillStyle = GOLD;
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillText(
        next ? `Berikutnya: ${next.prayerLabel} ${next.time} WIB — ${countdownLive(next.scheduledAt, now)}` : '—',
        28,
        y + 4,
      );
    }
    ctx.fillStyle = MUTED;
    ctx.font = '17px system-ui, sans-serif';
    const sourceLabel = source === 'kemenag_api' ? 'Kemenag RI · AlAdhan' : 'Rumus astronomis Kemenag';
    ctx.fillText(`Sumber: ${sourceLabel} · Kiblat ${Math.round(qibla)}° dari utara`, 28, h - 30);
  }, [schedule, next, qibla, source, cityName, timezone]);
  return (
    <mesh>
      <planeGeometry args={[1.7, 1.05]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Ornamen statis musala (mihrab, kaligrafi, panah kiblat)
// ---------------------------------------------------------------------------

/** Mihrab: relung hijau tua + lengkung emas + bintang 8 sudut. */
export function mihrabTexture(): THREE.CanvasTexture {
  return makeStaticTexture(360, 760, (ctx, w, h) => {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, w, h);
    // Pola geometris halus.
    ctx.strokeStyle = 'rgba(233,196,106,0.18)';
    ctx.lineWidth = 2;
    for (let y = 40; y < h; y += 80) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }
    // Lengkung mihrab (setengah lingkaran + dua tiang).
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w / 2, 300, 130, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 130, 300);
    ctx.lineTo(w / 2 - 130, h - 20);
    ctx.moveTo(w / 2 + 130, 300);
    ctx.lineTo(w / 2 + 130, h - 20);
    ctx.stroke();
    // Bintang 8 sudut di tengah lengkung.
    ctx.fillStyle = GOLD;
    const cx = w / 2;
    const cy = 300;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const r = i % 2 === 0 ? 62 : 28;
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#14532d';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KIBLAT', cx, h - 64);
  });
}

/** Kaligrafi geometris: bintang 8 sudut emas di atas hijau tua. */
export function calligraphyTexture(): THREE.CanvasTexture {
  return makeStaticTexture(480, 300, (ctx, w, h) => {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const r = i % 2 === 0 ? 78 : 34;
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Panah kiblat di lantai + tulisan KIBLAT. */
export function qiblaArrowTexture(): THREE.CanvasTexture {
  return makeStaticTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = GOLD;
    // Batang panah (menunjuk ke atas kanvas = arah kiblat setelah rotasi).
    ctx.fillRect(w / 2 - 14, 70, 28, 110);
    // Kepala panah.
    ctx.beginPath();
    ctx.moveTo(w / 2, 20);
    ctx.lineTo(w / 2 - 52, 96);
    ctx.lineTo(w / 2 + 52, 96);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KIBLAT', w / 2, 228);
  });
}
