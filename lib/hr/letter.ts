import PDFDocument from 'pdfkit';

type LetterInput = {
  orgName: string;
  signerName: string; // nama penandatangan pihak perusahaan
  contract: {
    contractNo: string;
    type: string; // PKWTT | PKWT
    position: string;
    startDate: Date | string;
    endDate?: Date | string | null;
    probationEnd?: Date | string | null;
    salary?: number | null;
  };
  employee: {
    name: string;
    nik?: string | null;
    address?: string | null;
    birthDate?: Date | string | null;
    phone?: string | null;
    department?: string | null;
  };
};

const tglID = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const rupiah = (n?: number | null) =>
  n == null ? '—' : 'Rp' + Number(n).toLocaleString('id-ID');

/** Masa percobaan dalam bulan, dihitung dari startDate ke probationEnd. */
function probationText(start: Date | string, end?: Date | string | null): string | null {
  if (!end) return null;
  const s = new Date(start); const e = new Date(end);
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (months <= 0) return null;
  return `${months} bulan`;
}

export async function buildContractLetter(input: LetterInput): Promise<Buffer> {
  const { orgName, signerName, contract, employee } = input;
  const isPKWTT = contract.type === 'PKWTT';

  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const H = (size: number, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size); };
  const para = (text: string, opts: any = {}) => {
    doc.text(text, { width: W, align: 'justify', lineGap: 3, ...opts });
    doc.moveDown(0.6);
  };
  const pasal = (n: number, title: string, body: string[]) => {
    H(11, true); doc.text(`Pasal ${n}`, { align: 'center' }); doc.moveDown(0.15);
    H(11, true); doc.text(title.toUpperCase(), { align: 'center' }); doc.moveDown(0.4);
    H(11); body.forEach((b) => para(b));
  };

  // ---- Kop ----
  H(16, true); doc.text(orgName.toUpperCase(), { align: 'center', width: W });
  doc.moveDown(0.3);
  H(11, true);
  doc.text(isPKWTT ? 'PERJANJIAN KERJA WAKTU TIDAK TERTENTU (PKWTT)' : 'PERJANJIAN KERJA WAKTU TERTENTU (PKWT)', { align: 'center', width: W });
  doc.moveDown(0.15);
  H(11); doc.text(`Nomor: ${contract.contractNo}`, { align: 'center', width: W });
  doc.moveDown(0.8);

  para('Yang bertanda tangan di bawah ini:');
  H(11, true); doc.text('PIHAK PERTAMA', { width: W }); doc.moveDown(0.2); H(11);
  para(`Nama Perusahaan : ${orgName}\nDiwakili oleh : ${signerName}\nDalam hal ini bertindak untuk dan atas nama ${orgName}, yang selanjutnya disebut PIHAK PERTAMA.`);
  H(11, true); doc.text('PIHAK KEDUA', { width: W }); doc.moveDown(0.2); H(11);
  para(
    `Nama : ${employee.name}\n` +
    `NIK : ${employee.nik || '—'}\n` +
    `Alamat : ${employee.address || '—'}\n` +
    `Tanggal Lahir : ${tglID(employee.birthDate)}\n` +
    `Telepon : ${employee.phone || '—'}\n` +
    `Dalam hal ini bertindak untuk dan atas nama diri sendiri, yang selanjutnya disebut PIHAK KEDUA.`
  );
  para('PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut PARA PIHAK, telah sepakat mengadakan Perjanjian Kerja dengan ketentuan sebagai berikut:');

  // ---- Pasal 1 ----
  pasal(1, 'Maksud dan Tujuan', [
    `PIHAK PERTAMA dengan ini mempekerjakan PIHAK KEDUA, dan PIHAK KEDUA dengan ini menerima pekerjaan tersebut, sebagai ${contract.position}${employee.department ? ` pada bagian ${employee.department}` : ''} di ${orgName}.`,
    'PIHAK KEDUA wajib melaksanakan tugas dan tanggung jawab jabatan tersebut dengan penuh dedikasi, kejujuran, dan profesionalisme.',
  ]);

  // ---- Pasal 2 ----
  const masaKerja = isPKWTT
    ? `Perjanjian Kerja ini berlaku terhitung mulai tanggal ${tglID(contract.startDate)} untuk jangka waktu yang tidak tertentu.` +
      (contract.probationEnd ? ` PIHAK KEDUA wajib menjalani masa percobaan selama ${probationText(contract.startDate, contract.probationEnd)} terhitung sejak tanggal mulai bekerja sampai dengan tanggal ${tglID(contract.probationEnd)}.` : '')
    : `Perjanjian Kerja ini berlaku untuk jangka waktu tertentu, terhitung mulai tanggal ${tglID(contract.startDate)} sampai dengan tanggal ${tglID(contract.endDate)}, dan berakhir dengan sendirinya tanpa memerlukan pemberitahuan terlebih dahulu.`;
  pasal(2, 'Masa Kerja', [masaKerja]);

  // ---- Pasal 3 ----
  pasal(3, 'Tugas dan Kewajiban Pekerja', [
    'a. Melaksanakan tugas sesuai jabatan dan deskripsi pekerjaan yang ditetapkan PIHAK PERTAMA;',
    'b. Mematuhi seluruh peraturan perusahaan, tata tertib, dan kode etik yang berlaku;',
    'c. Menjaga kerahasiaan data dan informasi perusahaan selama dan setelah berakhirnya Perjanjian Kerja ini;',
    'd. Melaporkan setiap kendala pekerjaan kepada atasan langsung secara berkala.',
  ]);

  // ---- Pasal 4 ----
  pasal(4, 'Upah dan Kesejahteraan', [
    `a. PIHAK KEDUA berhak menerima upah pokok sebesar ${rupiah(contract.salary)} per bulan, dibayarkan setiap akhir bulan melalui transfer bank;`,
    'b. PIHAK KEDUA berhak atas tunjangan dan fasilitas lain sesuai kebijakan perusahaan yang berlaku;',
    'c. PIHAK KEDUA diikutsertakan dalam program jaminan sosial sesuai ketentuan peraturan perundang-undangan.',
  ]);

  // ---- Pasal 5 ----
  pasal(5, 'Waktu Kerja', [
    'Waktu kerja mengikuti ketentuan perusahaan, yaitu 8 (delapan) jam per hari dan 40 (empat puluh) jam per minggu, dengan 1 (satu) jam istirahat setiap hari kerja, sesuai peraturan perundang-undangan yang berlaku.',
  ]);

  // ---- Pasal 6 ----
  pasal(6, 'Cuti dan Istirahat', [
    'PIHAK KEDUA berhak atas cuti tahunan selama 12 (dua belas) hari kerja setelah bekerja selama 12 (dua belas) bulan secara terus-menerus, serta hak istirahat lainnya sesuai peraturan perundang-undangan.',
  ]);

  // ---- Pasal 7 ----
  pasal(7, 'Berakhirnya Perjanjian Kerja', [
    isPKWTT
      ? 'Perjanjian Kerja ini dapat berakhir karena: kesepakatan PARA PIHAK, pengunduran diri PIHAK KEDUA dengan pemberitahuan tertulis minimal 30 (tiga puluh) hari sebelumnya, atau alasan lain sesuai Undang-Undang Ketenagakerjaan yang berlaku.'
      : 'Perjanjian Kerja ini berakhir dengan sendirinya pada tanggal berakhirnya jangka waktu sebagaimana dimaksud dalam Pasal 2, atau karena alasan lain sesuai Undang-Undang Ketenagakerjaan yang berlaku.',
  ]);

  // ---- Pasal 8 ----
  pasal(8, 'Penyelesaian Perselisihan', [
    'Setiap perselisihan yang timbul dari Perjanjian Kerja ini diselesaikan terlebih dahulu secara musyawarah untuk mufakat. Apabila tidak tercapai kesepakatan, PARA PIHAK sepakat menyelesaikannya sesuai mekanisme penyelesaian perselisihan hubungan industrial yang diatur dalam peraturan perundang-undangan.',
  ]);

  // ---- Pasal 9 ----
  pasal(9, 'Penutup', [
    'Perjanjian Kerja ini dibuat dalam rangkap 2 (dua) yang masing-masing bermeterai cukup dan mempunyai kekuatan hukum yang sama, 1 (satu) rangkap untuk PIHAK PERTAMA dan 1 (satu) rangkap untuk PIHAK KEDUA.',
  ]);

  // ---- TTD ----
  doc.moveDown(0.5);
  H(11); doc.text(`Ditetapkan di ${orgName}, pada tanggal ${tglID(new Date())}.`, { width: W, align: 'left' });
  doc.moveDown(1.2);
  const colW = W / 2;
  const y0 = doc.y;
  H(11, true);
  doc.text('PIHAK PERTAMA,', doc.page.margins.left, y0, { width: colW, align: 'center' });
  doc.text('PIHAK KEDUA,', doc.page.margins.left + colW, y0, { width: colW, align: 'center' });
  doc.moveDown(4);
  H(11, true);
  const y1 = doc.y;
  doc.text(`( ${signerName} )`, doc.page.margins.left, y1, { width: colW, align: 'center' });
  doc.text(`( ${employee.name} )`, doc.page.margins.left + colW, y1, { width: colW, align: 'center' });

  doc.end();
  return done;
}
