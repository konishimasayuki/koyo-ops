// 画面側で使うAI社員の見た目（名前・部署・色）
export const AGENT_LOOK = {
  sato: { name: '佐藤', dept: '秘書', color: '#C9A45C', icon: '秘' },
  takahashi: { name: '高橋', dept: '企画', color: '#4F8EF7', icon: '企' },
  tanaka: { name: '田中', dept: '営業', color: '#2FB37A', icon: '営' },
  nakamura: { name: '中村', dept: 'デザイン', color: '#E46BA6', icon: 'デ' },
  yamamoto: { name: '山本', dept: 'リスク', color: '#E2584D', icon: 'リ' },
  kobayashi: { name: '小林', dept: 'マーケ', color: '#9AA0AA', icon: 'マ' },
  kato: { name: '加藤', dept: '広告', color: '#9AA0AA', icon: '広' },
  ito: { name: '伊藤', dept: '予約・OTA', color: '#9AA0AA', icon: '予' },
  yoshida: { name: '吉田', dept: 'カスタマー', color: '#9AA0AA', icon: 'カ' },
  yamada: { name: '山田', dept: '経理', color: '#9AA0AA', icon: '経' },
  matsumoto: { name: '松本', dept: '総務・法務', color: '#9AA0AA', icon: '総' },
  inoue: { name: '井上', dept: '開発', color: '#9AA0AA', icon: '開' },
};
export const look = (id) => AGENT_LOOK[id] || { name: id, dept: '', color: '#9AA0AA', icon: '?' };
export const STATE_LABEL = { working: '作業中', assigned: 'タスクあり', idle: '待機中', future: '準備中' };
