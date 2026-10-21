'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

export function ConversationChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const pretty = data.map((d) => ({
    ...d,
    label: new Date(d.day + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
  }));
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pretty} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#087BFF" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#087BFF" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }}
            labelFormatter={(l) => `Tanggal ${l}`}
          />
          <Area type="monotone" dataKey="count" name="Pesan" stroke="#087BFF" strokeWidth={2.5} fill="url(#convGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PipelineChart({ data }: { data: Array<{ name: string; color: string; count: number }> }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#16324F' }} axisLine={false} tickLine={false} width={100} />
          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }} />
          <Bar dataKey="count" name="Lead" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
