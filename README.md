# KOYOグループ 業務管理システム

浩洋国際株式会社・HayateX株式会社・GTO株式会社の業務タスクを管理するシステムです。

- 構成：React + Vite（画面）／Vercel API Routes（`/api`）／Upstash Redis（データ）
- 初回ログイン：ID `z` / パスワード `z`（最初のアクセス時に自動作成されます）

## ファイル構成

```
api/_lib.js        共通処理（Redis接続・ログイン・パスワード暗号化・初期ユーザー作成）
api/auth.js        ログイン・ログアウト・ログイン中ユーザー
api/users.js       ユーザーの一覧・追加・変更・削除
api/config.js      タスク設定（事業・担当者の一覧）
api/tasks.js       業務タスクの一覧・登録・編集・完了・削除
api/vehicles.js    車両の一覧・登録・編集・削除
api/docs.js        各種資料（写真・PDF）の登録・分割保存・取得・削除
src/App.jsx        ログイン判定と画面切替
src/api.js         APIの呼び出し
src/components/Layout.jsx  メニュー（PCは左、スマホはハンバーガー）とロゴ
src/pages/Login.jsx        ログイン画面
src/pages/Tasks.jsx        業務タスク
src/pages/Vehicles.jsx     車両一覧
src/pages/Sites.jsx        HP閲覧（各社のHPへのリンク）
src/sites.js               HP閲覧に出すサイトの一覧
src/pages/Docs.jsx         各種資料（プレビュー付き）
public/hp/{slug}/index.html  各HPのHTML（準備中のページには <meta name="koyo-hp" content="draft">）
public/manifest.webmanifest・public/sw.js・public/icons  PWA（ホーム画面に追加して使える）
src/pages/Settings.jsx     設定（タスク設定・ユーザー追加・アカウント）
src/styles.css     スタイル
```

## 公開の手順

1. GitHubに新しいリポジトリを作り、このフォルダの中身をフォルダ構成のままアップロードする
2. Vercelで「Add New → Project」からそのリポジトリを選ぶ（Framework は Vite が自動で選ばれる）
3. Vercelのプロジェクトの「Storage」から Upstash（Redis）を作成し、プロジェクトに接続する
   - 環境変数 `KV_REST_API_URL` と `KV_REST_API_TOKEN`（または `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN`）が自動で入る
4. 「Redeploy」してURLを開き、`z` / `z` でログインする
5. 設定タブで、自分のパスワードを変更し、使う人を追加する

## データの持ち方（Redis）

| キー | 中身 |
| --- | --- |
| `koyo:users` | ユーザーIDの一覧（Set） |
| `koyo:user:{id}` | ユーザー（パスワードはscryptで暗号化） |
| `koyo:username:{ログインID}` | ログインID → ユーザーID |
| `koyo:session:{token}` | ログイン状態（14日で自動削除） |
| `koyo:config:tasks` | タスク設定（事業・担当者） |
| `koyo:tasks` | タスクIDの一覧（Set） |
| `koyo:task:{id}` | タスク |
| `koyo:vehicles` | 車両IDの一覧（Set） |
| `koyo:vehicle:{id}` | 車両 |
| `koyo:docs` | 資料IDの一覧（Set） |
| `koyo:doc:{id}` | 資料の情報（会社名・名称・ファイル名・サムネイル） |
| `koyo:docchunk:{id}:{n}` | ファイル本体（base64を約700KBずつ分割） |

一覧はMGETでまとめて取得します。ブラウザのlocalStorageは使っていません。
