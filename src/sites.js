// HP閲覧タブに出すサイトの一覧。HTMLは public/hp/{slug}/index.html に置く
export const SITES = [
  {
    company: '浩洋国際',
    items: [
      { slug: 'koyo-corporate', name: '会社HP', note: '浩洋国際株式会社のコーポレートサイト' },
      { slug: 'koyo-rental', name: 'レンタカー（国内）HP', note: 'ハイクラスレンタカーの予約・料金' },
      { slug: 'koyo-rental-global', name: 'レンタカー（海外）HP', note: '英語・繁体字・韓国語' },
      { slug: 'koyo-spyder', name: 'スパイダーHP', note: 'BRPスパイダーのレンタル' },
      { slug: 'koyo-camp-trailer', name: 'キャンプトレーラーHP', note: 'キャンプトレーラーの貸出' },
      { slug: 'koyo-trailer-sales', name: 'トレーラー販売HP', note: 'トレーラーの販売・登録代行' },
    ],
  },
  {
    company: 'HayateX',
    items: [
      { slug: 'hayatex-taxi', name: 'タクシー（国内）HP', note: '予約・料金・観光タクシー' },
      { slug: 'hayatex-charter', name: '貸切タクシーHP', note: '空港送迎・VIP・観光の貸切' },
      { slug: 'hayatex-taxi-global', name: 'タクシー（海外）HP', note: '英語・繁体字・韓国語' },
    ],
  },
  {
    company: 'GTO',
    items: [{ slug: 'gto-adtruck', name: 'アドトラックHP', note: '料金・実績・見積もり' }],
  },
];

export const sitePath = (slug) => `/hp/${slug}/index.html`;
