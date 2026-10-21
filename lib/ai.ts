// Abstraksi AI — mudah diganti ke OpenAI/Gemini tanpa mengubah UI.

export interface AIReplyInput {
  customerName: string;
  business?: string | null;
  lastMessages: Array<{ sender: string; body: string }>;
}

export interface CustomerInsight {
  business: string;
  interest: string;
  budget: string;
  stage: string;
  summary: string;
}

export interface AIService {
  generateReply(input: AIReplyInput): Promise<string>;
  classifyConversation(text: string): Promise<{ intent: string; confidence: number }>;
  extractCustomerData(messages: Array<{ sender: string; body: string }>): Promise<CustomerInsight>;
  detectIntent(text: string): Promise<string>;
  summarizeConversation(messages: Array<{ sender: string; body: string }>): Promise<string>;
}

class MockAIService implements AIService {
  async generateReply(input: AIReplyInput): Promise<string> {
    const name = input.customerName.split(' ')[0];
    const last = input.lastMessages[input.lastMessages.length - 1]?.body ?? '';
    if (/harga|paket|berapa/i.test(last)) {
      return `Halo ${name}! Kami punya paket Basic, Pro, dan Enterprise. Boleh tahu kebutuhan usaha ${name} seperti apa agar saya rekomendasikan yang paling pas?`;
    }
    if (/halo|hai|pagi|siang|sore/i.test(last)) {
      return `Halo ${name}! Terima kasih sudah menghubungi WOORK. Ada yang bisa saya bantu hari ini?`;
    }
    return `Baik ${name}, terima kasih infonya. Saya catat ya — ada lagi yang ingin ditanyakan?`;
  }

  async classifyConversation(text: string) {
    if (/harga|paket|beli|order/i.test(text)) return { intent: 'purchase_intent', confidence: 0.86 };
    if (/komplain|kecewa|buruk|lambat/i.test(text)) return { intent: 'complaint', confidence: 0.81 };
    return { intent: 'general_inquiry', confidence: 0.62 };
  }

  async extractCustomerData(messages: Array<{ sender: string; body: string }>): Promise<CustomerInsight> {
    const all = messages.map((m) => m.body).join(' ');
    const business = /toko kue/i.test(all) ? 'Toko kue' : /kopi|kafe/i.test(all) ? 'Kopi/Kafe' : 'Belum diketahui';
    const interest = /online/i.test(all) ? 'Pesanan online' : /paket pro/i.test(all) ? 'Paket Pro' : 'Belum diketahui';
    return {
      business,
      interest,
      budget: 'Belum diketahui',
      stage: /tanya|mau/i.test(all) ? 'Terkualifikasi' : 'Baru',
      summary: `Percakapan ${messages.length} pesan. Minat: ${interest}.`,
    };
  }

  async detectIntent(text: string): Promise<string> {
    return (await this.classifyConversation(text)).intent;
  }

  async summarizeConversation(messages: Array<{ sender: string; body: string }>): Promise<string> {
    return `Ringkasan ${messages.length} pesan: pelanggan menanyakan produk/layanan dan membutuhkan tindak lanjut.`;
  }
}

// Ganti dengan implementasi OpenAI/Gemini di sini bila sudah ada API key.
export const aiService: AIService = new MockAIService();
