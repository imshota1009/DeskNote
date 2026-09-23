/* お試し用の見本。実在の会社や予定ではありません。
   日付は開いた日に合わせて作るので、いつ見ても「今日」「明日」が埋まって見える。 */
function buildDemo() {
    const at = offset => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    };
    const id = n => 'demo-' + n;

    return {
        plans: [
            { id: id(1), date: at(0), time: '09:30', end: '10:30', company: 'サンプル商事', title: '会社説明会（オンライン）', kind: 'seminar' },
            { id: id(2), date: at(0), time: '16:00', end: '17:00', company: 'テスト工業', title: 'エンジニア職 カジュアル面談', kind: 'selection' },

            { id: id(3), date: at(1), time: '10:00', end: '12:00', company: 'デモソフト', title: '1day仕事体験（グループワーク）', kind: 'intern' },
            { id: id(4), date: at(1), time: '15:00', end: '15:30', company: '見本システム', title: '若手社員との座談会', kind: 'seminar' },

            { id: id(5), date: at(3), time: '13:00', end: '17:30', company: 'サンプル電機', title: '秋季インターンシップ 2DAYS', endDate: at(4), kind: 'intern' },
            { id: id(6), date: at(6), time: '11:00', end: '12:00', company: 'テスト情報サービス', title: '一次選考', kind: 'selection' },
            { id: id(7), date: at(12), time: '14:00', end: '16:00', company: '見本ソリューションズ', title: '職種別 業界研究セミナー', kind: 'seminar' },

            { id: id(8), date: at(-2), time: '13:30', end: '15:00', company: 'サンプル商事', title: '会社紹介セミナー', kind: 'seminar' },
            { id: id(9), date: at(-5), time: '10:00', end: '16:00', company: 'デモ製作所', title: '夏季インターンシップ', kind: 'intern' },
            { id: id(10), date: at(-9), time: '18:00', end: '19:00', company: '見本システム', title: 'オンライン説明会', kind: 'seminar' }
        ],
        todos: [
            { id: id(21), company: 'サンプル商事', text: 'エントリーシート 提出', due: at(-1), dueTime: '23:59', done: false, created: 1 },
            { id: id(22), company: 'テスト工業', text: 'Webテスト 受検', due: at(0), dueTime: '18:00', done: false, created: 2 },
            { id: id(23), company: 'デモソフト', text: '履歴書 提出', due: at(2), dueTime: '', done: false, created: 3 },
            { id: id(24), company: '見本ソリューションズ', text: '適性検査（2種類）', due: at(8), dueTime: '', done: false, created: 4 },
            { id: id(25), company: '', text: '証明写真を撮り直す', due: '', dueTime: '', done: false, created: 5 },
            { id: id(26), company: 'サンプル電機', text: 'face to faceの案内を確認', due: at(-3), dueTime: '', done: true, created: 6 }
        ]
    };
}
