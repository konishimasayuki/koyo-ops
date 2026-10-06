import { AGENTS, FUTURE, LIMITS, MODELS, OUTPUT_SPEC, USD_JPY, WEB_SEARCH_USD } from './_agents.js';
import { body, newId, now, redis, send, withAuth } from './_lib.js';

// koyo-ops の既存データと混ざらないよう、キーはすべて ai: で始める
const k = (...p) => ['ai', ...p].join(':');
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const month = () => today().slice(0, 6);
const yen = (n) => Math.round(n * 10) / 10;

async function getList(r, key) {
  return (await r.get(key)) || [];
}
async function pushLimited(r, key, item, max) {
  const list = await getList(r, key);
  list.push(item);
  await r.set(key, list.slice(-max));
}
async function log(r, text, agent = '') {
  await pushLimited(r, k('log'), { id: newId(), at: now(), text, agent }, 60);
}
async function setAgent(r, id, state, activity, caseId = '') {
  const all = (await r.get(k('agents'))) || {};
  all[id] = { state, activity, caseId, at: now() };
  await r.set(k('agents'), all);
}

// ---------- 費用 ----------
async function costs(r, caseId) {
  const [day, mon, cs] = await Promise.all([r.get(k('cost', 'day', today())), r.get(k('cost', month())), caseId ? r.get(k('cost', 'case', caseId)) : 0]);
  return { day: Number(day || 0), month: Number(mon || 0), case: Number(cs || 0) };
}
async function addCost(r, caseId, amount) {
  const c = await costs(r, caseId);
  await r.set(k('cost', 'day', today()), yen(c.day + amount), { ex: 3 * 86400 });
  await r.set(k('cost', month()), yen(c.month + amount));
  if (caseId) await r.set(k('cost', 'case', caseId), yen(c.case + amount));
}
async function guard(r, caseId) {
  const c = await costs(r, caseId);
  if (c.day >= LIMITS.dayYen) throw new Error(`今日のAI費用が上限（${LIMITS.dayYen}円）に達したため止めています`);
  if (caseId && c.case >= LIMITS.caseYen) throw new Error(`この案件のAI費用が上限（${LIMITS.caseYen}円）に達したため止めています`);
}

// ---------- Claude API ----------
async function claude(agentId, { prompt, maxTokens = 2500, caseId = '' }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('VercelにANTHROPIC_API_KEY（ClaudeのAPIキー）が設定されていません');
  const a = AGENTS[agentId];
  const m = MODELS[a.model];
  const payload = { model: m.id, max_tokens: maxTokens, system: a.role, messages: [{ role: 'user', content: prompt }] };
  if (a.search) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: a.search }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude APIエラー：${data?.error?.message || res.status}`);
  const u = data.usage || {};
  const searches = u.server_tool_use?.web_search_requests || 0;
  const usd = ((u.input_tokens || 0) * m.in + (u.output_tokens || 0) * m.out) / 1e6 + searches * WEB_SEARCH_USD;
  const cost = usd * USD_JPY;
  await addCost(redis(), caseId, cost);
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { text, cost: yen(cost) };
}

function parseJson(text) {
  const s = text.replace(/```json|```/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b < 0) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

// ---------- 案件 ----------
async function listCases(r) {
  const ids = (await r.get(k('cases'))) || [];
  if (!ids.length) return [];
  const vals = await r.mget(...ids.map((id) => k('case', id)));
  return vals.filter(Boolean);
}
async function saveCase(r, c) {
  c.updatedAt = now();
  await r.set(k('case', c.id), c);
  const ids = (await r.get(k('cases'))) || [];
  if (!ids.includes(c.id)) await r.set(k('cases'), [c.id, ...ids].slice(0, 200));
}
async function listOutputs(r, caseId) {
  const ids = (await r.get(k('outputs'))) || [];
  if (!ids.length) return [];
  const vals = (await r.mget(...ids.map((id) => k('output', id)))).filter(Boolean);
  return caseId ? vals.filter((o) => o.caseId === caseId) : vals;
}
async function saveOutput(r, o) {
  await r.set(k('output', o.id), o);
  const ids = (await r.get(k('outputs'))) || [];
  if (!ids.includes(o.id)) await r.set(k('outputs'), [o.id, ...ids].slice(0, 300));
}

// 秘書：指示を受けて返事し、必要なら案件とタスクを作る
async function secretary(r, me, text) {
  await guard(r, '');
  await setAgent(r, 'sato', 'working', '指示を整理中…');
  const chat = await getList(r, k('chat'));
  const cases = (await listCases(r)).filter((c) => c.status !== 'done').slice(0, 5);
  const history = chat
    .slice(-10)
    .map((m) => `${m.from === 'user' ? '小西さん' : '佐藤'}：${m.text}`)
    .join('\n');
  const openCases = cases.map((c) => `- ${c.title}（${c.status}）`).join('\n') || 'なし';
  const prompt = `これまでの会話：\n${history || 'なし'}\n\n進行中の案件：\n${openCases}\n\n小西さんの新しいメッセージ：\n${text}\n\n次のJSONだけを返してください（前後に文章を付けない）。
{
  "reply": "小西さんへの返事（結論から、3〜5文）",
  "case": null または {
    "title": "案件名（20字以内）",
    "goal": "この案件のゴール（2〜3文）",
    "company": "浩洋国際" | "HayateX" | "GTO" | "3社共同",
    "tasks": [ { "agent": "担当のID", "title": "タスク名", "brief": "担当への具体的な指示（3〜6文）" } ]
  }
}
担当のID（必要な人だけ選ぶ）：
- takahashi＝企画 高橋（市場調査・事業案・料金案）
- tanaka＝営業 田中（営業先リスト・営業メール）
- nakamura＝デザイン 中村（チラシ・バナー・LP）
- kobayashi＝マーケ 小林（Instagram・Xの投稿）
- kato＝広告 加藤（Google・Meta広告の文面と予算）
- ito＝予約・OTA 伊藤（楽天トラベル・じゃらんの掲載文と料金表）
- yoshida＝カスタマー 吉田（問い合わせへの返信・FAQ）
- yamada＝経理 山田（見積書・請求書・収支の試算）
- matsumoto＝総務・法務 松本（契約書・許認可・法令チェック）
- inoue＝開発 井上（HP・システムの改修案）
ルール：仕事の依頼なら case を作る（質問や雑談なら null）。tasks は最大5つ、1人1つまで。企画が必要なら企画を最初に、法務チェックが必要なら最後に置く。リスク確認のタスクはシステムが自動で足すので入れない。`;
  const { text: out, cost } = await claude('sato', { prompt, maxTokens: 1500 });
  const j = parseJson(out) || { reply: out, case: null };
  let created = null;
  if (j.case && Array.isArray(j.case.tasks) && j.case.tasks.length) {
    const id = newId();
    const tasks = j.case.tasks
      .filter((t, i, arr) => OUTPUT_SPEC[t.agent] && t.agent !== 'yamamoto' && arr.findIndex((x) => x.agent === t.agent) === i)
      .slice(0, 3)
      .map((t) => ({
        id: newId(),
        agent: t.agent,
        title: String(t.title || OUTPUT_SPEC[t.agent].label).slice(0, 60),
        brief: String(t.brief || '').slice(0, 1200),
        status: 'todo',
      }));
    tasks.push({ id: newId(), agent: 'yamamoto', title: '成果物のリスク確認', brief: '法令・費用・競合・実現性の観点で、すべての成果物に反対意見を出す。', status: 'todo' });
    created = {
      id,
      title: String(j.case.title || '新しい案件').slice(0, 40),
      goal: String(j.case.goal || text).slice(0, 600),
      company: ['浩洋国際', 'HayateX', 'GTO', '3社共同'].includes(j.case.company) ? j.case.company : '3社共同',
      instruction: text,
      status: 'active',
      tasks,
      createdAt: now(),
      createdBy: me.id,
    };
    await saveCase(r, created);
    await log(r, `新しい案件「${created.title}」を作り、${tasks.length}件のタスクを振り分けました`, 'sato');
    for (const t of tasks) await setAgent(r, t.agent, 'assigned', `「${t.title}」を担当`, id);
  }
  await setAgent(r, 'sato', 'idle', created ? `案件「${created.title}」を管理中` : '指示待ち');
  return { reply: String(j.reply || '承知しました。').slice(0, 1500), caseId: created?.id || '', cost };
}

// 部署AI：タスクを1つ実行して成果物を作る
async function runTask(r, caseId, taskId) {
  const c = await r.get(k('case', caseId));
  if (!c) throw new Error('案件が見つかりません');
  const t = c.tasks.find((x) => x.id === taskId);
  if (!t) throw new Error('タスクが見つかりません');
  if (t.status === 'doing') throw new Error('このタスクは実行中です');
  await guard(r, caseId);
  const spec = OUTPUT_SPEC[t.agent];
  const agent = AGENTS[t.agent];
  t.status = 'doing';
  await saveCase(r, c);
  await setAgent(r, t.agent, 'working', `「${t.title}」を作成中…`, caseId);
  await log(r, `${agent.dept} ${agent.name}が「${t.title}」に取りかかりました`, t.agent);

  const prev = (await listOutputs(r, caseId)).filter((o) => o.taskId !== t.id);
  const prevText = prev
    .map(
      (o) => `### ${o.title}（${AGENTS[o.agent]?.dept} ${AGENTS[o.agent]?.name}）\n${o.kind === 'html' ? '（チラシのHTML。内容は文言のみ参照）\n' : ''}${o.content.slice(0, 3500)}`,
    )
    .join('\n\n');
  const feedback = t.feedback ? `\n\n【小西さんからの差し戻しコメント】\n${t.feedback}\nこのコメントを必ず反映して作り直すこと。` : '';
  const base = `案件：${c.title}\n会社：${c.company}\nゴール：${c.goal}\n小西さんの指示：${c.instruction}\n\nあなたのタスク：${t.title}\n指示：${t.brief}${feedback}`;
  let prompt;
  if (spec.kind === 'html') {
    prompt = `${base}\n\nA4縦1枚のチラシを、HTML1ファイル（CSSは<style>内、画像なし、外部読み込みなし、日本語フォントはsystem-ui）で作ってください。出力はHTMLのみ（<!doctype html>から</html>まで）。最後にHTMLコメントで、配色とレイアウトの理由を3行で説明すること。${prevText ? `\n\n参考：これまでの成果物\n${prevText}` : ''}`;
  } else if (t.agent === 'yamamoto') {
    prompt = `${base}\n\n次の成果物すべてについて、法令・費用・競合・実現性の観点で反対意見と修正案を出してください。Markdownで、成果物ごとに「重大」「注意」「軽微」の3段階を付けて箇条書きにし、最後に「小西さんが判断すべきこと」を最大3つまとめる。\n\n${prevText || '（成果物がまだありません。案件の進め方そのものに反論してください）'}`;
  } else {
    prompt = `${base}\n\nMarkdownで、そのまま社内で読める${spec.label}を作ってください（中身：${spec.hint}）。見出し・箇条書き・表を使い、数字や事実には根拠のURLを付けること。${prevText ? `\n\n参考：これまでの成果物\n${prevText}` : ''}`;
  }
  try {
    const { text, cost } = await claude(t.agent, { prompt, maxTokens: spec.kind === 'html' ? 4000 : 3000, caseId });
    let content = text;
    if (spec.kind === 'html') {
      const a = text.search(/<!doctype html|<html/i);
      const b = text.toLowerCase().lastIndexOf('</html>');
      content = a >= 0 && b > a ? text.slice(a, b + 7) : text;
    }
    const o = {
      id: t.outputId || newId(),
      caseId,
      taskId: t.id,
      agent: t.agent,
      kind: spec.kind,
      title: `${spec.label}：${c.title}`,
      content,
      status: spec.approval ? 'pending' : 'done',
      cost,
      createdAt: now(),
    };
    await saveOutput(r, o);
    t.outputId = o.id;
    t.status = 'done';
    t.feedback = '';
    t.doneAt = now();
    if (spec.approval) {
      await pushLimited(
        r,
        k('inbox'),
        {
          id: newId(),
          type: 'approval',
          caseId,
          taskId: t.id,
          outputId: o.id,
          title: `${spec.label}の承認`,
          detail: `${agent.dept} ${agent.name}が作成。外に出す前に確認してください。`,
          status: 'open',
          at: now(),
        },
        200,
      );
    }
    const allDone = c.tasks.every((x) => x.status === 'done');
    if (allDone) {
      c.status = 'review';
      await pushLimited(
        r,
        k('inbox'),
        { id: newId(), type: 'report', caseId, title: `完了報告：${c.title}`, detail: '全タスクが終わりました。成果物とリスク確認を見てください。', status: 'open', at: now() },
        200,
      );
      await log(r, `案件「${c.title}」の全タスクが終わりました`, 'sato');
    }
    await saveCase(r, c);
    await setAgent(r, t.agent, 'idle', `「${t.title}」を提出しました`, caseId);
    await log(r, `${agent.dept} ${agent.name}が「${spec.label}」を提出しました（${cost}円）`, t.agent);
    return { output: o, case: c };
  } catch (e) {
    t.status = 'error';
    t.error = e.message;
    await saveCase(r, c);
    await setAgent(r, t.agent, 'idle', 'エラーで止まりました', caseId);
    await log(r, `${agent.dept} ${agent.name}の作業がエラーで止まりました：${e.message}`, t.agent);
    throw e;
  }
}

export default withAuth(async (req, res, me) => {
  const r = redis();
  const q = req.query || {};

  if (req.method === 'GET') {
    if (q.view === 'chat') return send(res, 200, { chat: await getList(r, k('chat')) });
    if (q.view === 'cases') return send(res, 200, { cases: await listCases(r) });
    if (q.view === 'outputs') {
      const outs = await listOutputs(r, q.caseId);
      return send(res, 200, { outputs: q.full ? outs : outs.map((o) => ({ ...o, content: o.kind === 'html' ? '' : o.content.slice(0, 400) })) });
    }
    if (q.view === 'output') return send(res, 200, { output: await r.get(k('output', q.id)) });
    if (q.view === 'inbox') return send(res, 200, { inbox: (await getList(r, k('inbox'))).reverse() });
    // オフィス：AI社員の状況・数字・お知らせ
    const [states, cases, inbox, logs, c] = await Promise.all([r.get(k('agents')), listCases(r), getList(r, k('inbox')), getList(r, k('log')), costs(r)]);
    const tasks = cases.flatMap((x) => x.tasks.map((t) => ({ ...t, caseId: x.id })));
    return send(res, 200, {
      agents: Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, dept: a.dept, ...(states?.[id] || { state: 'idle', activity: '指示待ち' }) })),
      future: FUTURE,
      stats: {
        activeCases: cases.filter((x) => x.status === 'active').length,
        tasksOpen: tasks.filter((t) => t.status !== 'done').length,
        tasksDone: tasks.filter((t) => t.status === 'done').length,
        inbox: inbox.filter((i) => i.status === 'open').length,
        costMonth: Math.round(c.month),
        costDay: Math.round(c.day),
      },
      limits: LIMITS,
      apiReady: !!process.env.ANTHROPIC_API_KEY,
      logs: logs.slice(-12).reverse(),
    });
  }

  if (req.method === 'POST') {
    const b = body(req);
    if (q.action === 'chat') {
      const text = String(b.text || '')
        .trim()
        .slice(0, 2000);
      if (!text) return send(res, 400, { error: 'メッセージを入力してください' });
      await pushLimited(r, k('chat'), { id: newId(), from: 'user', text, at: now() }, 120);
      try {
        const out = await secretary(r, me, text);
        await pushLimited(r, k('chat'), { id: newId(), from: 'sato', text: out.reply, caseId: out.caseId, at: now() }, 120);
        return send(res, 200, out);
      } catch (e) {
        await setAgent(r, 'sato', 'idle', '指示待ち');
        await pushLimited(r, k('chat'), { id: newId(), from: 'system', text: e.message, at: now() }, 120);
        return send(res, 500, { error: e.message });
      }
    }
    if (q.action === 'run') {
      try {
        return send(res, 200, await runTask(r, b.caseId, b.taskId));
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }
    if (q.action === 'decide') {
      const inbox = await getList(r, k('inbox'));
      const item = inbox.find((i) => i.id === b.id);
      if (!item) return send(res, 404, { error: '見つかりません' });
      item.status = b.decision === 'return' ? 'returned' : 'approved';
      item.decidedAt = now();
      item.note = String(b.note || '').slice(0, 1000);
      await r.set(k('inbox'), inbox);
      if (item.outputId) {
        const o = await r.get(k('output', item.outputId));
        if (o) {
          o.status = item.status;
          await r.set(k('output', o.id), o);
        }
      }
      if (item.type === 'approval' && item.status === 'returned') {
        const c = await r.get(k('case', item.caseId));
        const t = c?.tasks.find((x) => x.id === item.taskId);
        if (t) {
          t.status = 'todo';
          t.feedback = item.note || 'もう一度見直してください';
          c.status = 'active';
          await saveCase(r, c);
          await setAgent(r, t.agent, 'assigned', `差し戻し：「${t.title}」をやり直し`, c.id);
        }
      }
      if (item.type === 'report' && item.status === 'approved') {
        const c = await r.get(k('case', item.caseId));
        if (c) {
          c.status = 'done';
          await saveCase(r, c);
        }
      }
      await log(r, `小西さんが「${item.title}」を${item.status === 'returned' ? '差し戻しました' : '承認しました'}`, '');
      return send(res, 200, { item });
    }
    if (q.action === 'clear-chat') {
      await r.set(k('chat'), []);
      return send(res, 200, { ok: true });
    }
  }

  if (req.method === 'DELETE' && q.caseId) {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ削除できます' });
    const outs = await listOutputs(r, q.caseId);
    for (const o of outs) await r.del(k('output', o.id));
    const ids = (await r.get(k('outputs'))) || [];
    await r.set(
      k('outputs'),
      ids.filter((id) => !outs.some((o) => o.id === id)),
    );
    await r.del(k('case', q.caseId));
    await r.set(
      k('cases'),
      ((await r.get(k('cases'))) || []).filter((id) => id !== q.caseId),
    );
    const inbox = await getList(r, k('inbox'));
    await r.set(
      k('inbox'),
      inbox.filter((i) => i.caseId !== q.caseId),
    );
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
