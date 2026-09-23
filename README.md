# 📝 DeskNote (今日のノート)

🚀 **アプリを開く (Open Live):** [https://desknote.web.app](https://desknote.web.app)

<details>
<summary>🇯🇵 日本語のドキュメントを表示 (Click to expand)</summary>

# 📝 今日のノート 🗓️ 就活の予定を、みんなで1枚の紙に

セミナー・インターン・選考の予定と、やることリストを、1画面にまとめて置いておくためのノートです。
ノートIDを教えるだけで、友だちや同じ就活仲間と同じノートを共有できます。ログインは要りません。

古いタブレットやスマホを机に立てかけ、いつも開いたままにしておく使い方を想定しています。

---

## 🚀 アプリを開く

インターネット上ですぐ使えます：
👉 **[https://desknote.web.app](https://desknote.web.app)**

---

## ✨ できること

*   **予定の記録** — 日付・時刻・企業名・内容を、セミナー / インターン / 選考の3種類で色分けして登録
*   **やることリスト** — 期限付きのToDo。終わったものはまとめて隠れます
*   **4つの見方** — 「あした」「これから」「これまで」「カレンダー」をタブで切り替え
*   **共有** — ノートIDを伝えるだけで、同じノートを全員が同時に編集できます
*   **参加者の顔** — 端末ごとに顔（絵文字）が割り当てられ、いま誰が見ているかが分かります
*   **ホストの操作** — ノートを作った人だけが、ノートに名前を付けたり、参加者を退出させたりできます
*   **オフライン対応** — 電波がなくても書けて、つながったときにまとめて送られます
*   **デモ** — ノートを作る前に、サンプルの予定で中身を試せます

---

## 🗂️ 構成

*   `public/index.html` — 画面の組み立て
*   `public/app.js` — 予定・ToDo・共有・カレンダーの処理（Firebase SDK はCDN読み込み）
*   `public/style.css` — 見た目
*   `public/demo.js` — お試し用のサンプルデータ
*   `firestore.rules` — 誰がどのノートを読み書きできるかの決まり
*   `firebase.json` / `.firebaserc` — Firebase Hosting の設定

---

## 🔐 ノートIDについて

ノートIDは **20文字の乱数** で作られ、これを知っている人だけがそのノートを開けます。
逆に言えば、**IDを知っている人は誰でも中身を読み書きできます**。

*   パスワードや暗証番号、口座番号など、人に見られて困るものは書かないでください
*   IDは、共有したい相手にだけ伝えてください
*   間違えて配ってしまったときは、新しいノートを作り直すのが確実です

---

## 💻 手元で動かす

```bash
npx serve public
```

Firestore は公開中のプロジェクトにつながるので、自分の環境で試す場合は `public/app.js` の Firebase 設定を、ご自身のプロジェクトのものに置き換えてください。

</details>

<details>
<summary>🇺🇸 Show English Document (Click to expand)</summary>

# 📝 DeskNote 🗓️ One Shared Sheet for Your Job Hunt

DeskNote keeps your seminars, internships and interviews — plus your to-do list — on a single screen.
Share the note ID and everyone edits the same page. No accounts, no sign-in.

It is built for leaving open all day on an old tablet propped up on your desk.

---

## 🚀 Open Live
👉 **[https://desknote.web.app](https://desknote.web.app)**

---

## ✨ Features

*   **Schedule** — Date, time, company and details, colour-coded as Seminar / Internship / Selection
*   **To-do list** — Tasks with deadlines; finished ones fold away
*   **Four views** — Tomorrow, Upcoming, Past and Calendar
*   **Sharing** — Anyone with the note ID edits the same note in real time
*   **Faces** — Each device gets its own emoji face, so you can see who is looking
*   **Host controls** — Whoever created the note can rename it and remove viewers
*   **Offline first** — Write without a connection; changes sync once you are back online
*   **Demo mode** — Try the app with sample data before creating a note

---

## 🗂️ File Structure

*   `public/index.html` — Markup
*   `public/app.js` — Plans, to-dos, sharing and calendar logic (Firebase SDK via CDN)
*   `public/style.css` — Styles
*   `public/demo.js` — Sample data for the demo
*   `firestore.rules` — Who may read and write which note
*   `firebase.json` / `.firebaserc` — Firebase Hosting configuration

---

## 🔐 About Note IDs

A note ID is **20 random characters**, and holding it is the only thing required to open that note.
Which also means **anyone who has the ID can read and edit everything in it**.

*   Never write passwords, PINs or account numbers in a note
*   Share the ID only with the people you mean to share it with
*   If an ID leaks, create a new note rather than trying to clean up the old one

---

## 💻 Run Locally

```bash
npx serve public
```

Firestore points at the live project, so replace the Firebase config in `public/app.js` with your own project if you want to run it independently.

</details>

---

## 📄 License

MIT License — see [LICENSE](LICENSE).
