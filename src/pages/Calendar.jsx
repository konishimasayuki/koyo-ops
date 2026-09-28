import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';
import { holidayName } from '../holidays.js';

const COMPANIES = ['浩洋国際', 'HayateX', 'GTO', '3社共同'];
const COMPANY_CLASS = { 浩洋国際: 'c-koyo', HayateX: 'c-hx', GTO: 'c-gto', '3社共同': 'c-all' };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const pad = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k) => new Date(`${k.slice(0, 10)}T00:00:00`);
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = (d) => addDays(d, -d.getDay());
const minutes = (t) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));
const hm = (t) => `${Number(t.slice(11, 13))}:${t.slice(14, 16)}`;
const jpDate = (k) => {
  const d = parse(k);
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
};

// その日に表示する予定（終日→時間の早い順）
function eventsOn(events, k) {
  return events.filter((e) => e.start.slice(0, 10) <= k && e.end.slice(0, 10) >= k).sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
}

function range(view, cursor) {
  if (view === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const from = startOfWeek(first);
    return { from, days: 42 };
  }
  if (view === 'week') return { from: startOfWeek(cursor), days: 7 };
  return { from: cursor, days: 60 };
}

export default function Calendar({ onAuthError }) {
  const today = dkey(new Date());
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [hidden, setHidden] = useState({});
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const { from, days } = range(view, cursor);
  const fromKey = dkey(from);
  const toKey = dkey(addDays(from, days - 1));

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.events(fromKey, toKey);
      setEvents(r.events);
    } catch (e) {
      onAuthError(e);
      setError(e.message);
    }
  }, [fromKey, toKey, onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .taskConfig()
      .then((r) => setAssignees(r.config.assignees))
      .catch(() => {});
  }, []);

  const shown = useMemo(() => events.filter((e) => !hidden[e.company]), [events, hidden]);
  const assigneeName = (id) => assignees.find((a) => a.id === id)?.name || '';

  const move = (dir) => {
    if (view === 'month') setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else if (view === 'week') setCursor((c) => addDays(c, 7 * dir));
    else setCursor((c) => addDays(c, 30 * dir));
  };
  const goToday = () => {
    setCursor(new Date());
    setSelected(today);
  };

  const title =
    view === 'month'
      ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
      : view === 'week'
        ? `${from.getFullYear()}年 ${from.getMonth() + 1}/${from.getDate()}〜${addDays(from, 6).getMonth() + 1}/${addDays(from, 6).getDate()}`
        : `${from.getMonth() + 1}/${from.getDate()}から60日`;

  const newEvent = (dateKey, hour) => {
    const k = dateKey || selected || today;
    if (hour === undefined) {
      setEditing({ title: '', allDay: false, start: `${k}T10:00`, end: `${k}T11:00`, company: '3社共同', assigneeId: '', location: '', memo: '' });
    } else {
      const h2 = Math.min(hour + 1, 23);
      setEditing({
        title: '',
        allDay: false,
        start: `${k}T${pad(hour)}:00`,
        end: `${k}T${pad(h2)}:${hour === 23 ? '59' : '00'}`,
        company: '3社共同',
        assigneeId: '',
        location: '',
        memo: '',
      });
    }
  };

  const save = async (form) => {
    const r = form.id ? await api.updateEvent(form) : await api.addEvent(form);
    setEvents((l) => (form.id ? l.map((x) => (x.id === r.event.id ? r.event : x)) : [...l, r.event]));
    setEditing(null);
  };
  const remove = async (id) => {
    await api.deleteEvent(id);
    setEvents((l) => l.filter((x) => x.id !== id));
    setEditing(null);
  };

  return (
    <section className="page cal-page">
      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="btn ghost sm" onClick={goToday}>
            今日
          </button>
          <button type="button" className="icon" aria-label="前へ" onClick={() => move(-1)}>
            ‹
          </button>
          <button type="button" className="icon" aria-label="次へ" onClick={() => move(1)}>
            ›
          </button>
          <h1 className="cal-title">{title}</h1>
        </div>
        <div className="cal-right">
          <div className="seg compact cal-views" role="group" aria-label="表示">
            {[
              ['month', '月'],
              ['week', '週'],
              ['list', '予定'],
            ].map(([k, l]) => (
              <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="btn gold" onClick={() => newEvent()}>
            ＋ 予定
          </button>
        </div>
      </div>

      <div className="cal-filter">
        {COMPANIES.map((c) => (
          <button key={c} type="button" className={`cal-co${hidden[c] ? ' off' : ''}`} onClick={() => setHidden((h) => ({ ...h, [c]: !h[c] }))}>
            <i className={`dot ${COMPANY_CLASS[c]}`} />
            {c}
          </button>
        ))}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {view === 'month' && (
        <MonthView
          from={from}
          cursor={cursor}
          today={today}
          selected={selected}
          events={shown}
          onSelect={(k) => setSelected(k)}
          onCreate={(k) => newEvent(k)}
          onOpen={setEditing}
          assigneeName={assigneeName}
        />
      )}
      {view === 'week' && <WeekView from={from} today={today} events={shown} onCreate={newEvent} onOpen={setEditing} />}
      {view === 'list' && <ListView from={from} today={today} events={shown} onOpen={setEditing} assigneeName={assigneeName} />}

      {editing && <EventModal event={editing} assignees={assignees} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </section>
  );
}

function Chip({ e, onOpen }) {
  return (
    <button
      type="button"
      className={`ev ${e.allDay ? `all ${COMPANY_CLASS[e.company]}` : 'timed'}`}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
      title={e.title}
    >
      {!e.allDay && <i className={`dot ${COMPANY_CLASS[e.company]}`} />}
      {!e.allDay && <span className="ev-time">{hm(e.start)}</span>}
      <span className="ev-title">{e.title}</span>
    </button>
  );
}

function MonthView({ from, cursor, today, selected, events, onSelect, onCreate, onOpen, assigneeName }) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const dayEvents = eventsOn(events, selected);
  return (
    <>
      <div className="month">
        {WEEK.map((w, i) => (
          <div key={w} className={`mh${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const k = dkey(d);
          const list = eventsOn(events, k);
          const hol = holidayName(k);
          const other = d.getMonth() !== cursor.getMonth();
          return (
            <div
              key={k}
              className={`mc${other ? ' other' : ''}${k === today ? ' today' : ''}${k === selected ? ' sel' : ''}`}
              onClick={() => onSelect(k)}
              onDoubleClick={() => onCreate(k)}
            >
              <div className={`mc-num${d.getDay() === 0 || hol ? ' sun' : d.getDay() === 6 ? ' sat' : ''}`}>
                <span>{d.getDate()}</span>
                {hol && <small>{hol}</small>}
              </div>
              <div className="mc-evs">
                {list.slice(0, 3).map((e) => (
                  <Chip key={e.id} e={e} onOpen={onOpen} />
                ))}
                {list.length > 3 && <span className="more">他{list.length - 3}件</span>}
              </div>
              <div className="mc-dots" aria-hidden="true">
                {list.slice(0, 4).map((e) => (
                  <i key={e.id} className={`dot ${COMPANY_CLASS[e.company]}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="day-panel">
        <div className="day-head">
          <h2>
            {jpDate(selected)}
            {holidayName(selected) && <small className="hol">{holidayName(selected)}</small>}
          </h2>
          <button type="button" className="btn ghost sm" onClick={() => onCreate(selected)}>
            ＋ この日に予定
          </button>
        </div>
        {dayEvents.length === 0 ? <p className="muted small">予定はありません</p> : <EventRows list={dayEvents} onOpen={onOpen} assigneeName={assigneeName} />}
      </div>
    </>
  );
}

function EventRows({ list, onOpen, assigneeName }) {
  return (
    <ul className="ev-rows">
      {list.map((e) => (
        <li key={e.id}>
          <button type="button" className="ev-row" onClick={() => onOpen(e)}>
            <span className={`ev-bar ${COMPANY_CLASS[e.company]}`} aria-hidden="true" />
            <span className="ev-when">
              {e.allDay
                ? '終日'
                : `${hm(e.start)}〜${e.end.slice(0, 10) !== e.start.slice(0, 10) ? `${Number(e.end.slice(5, 7))}/${Number(e.end.slice(8, 10))} ` : ''}${hm(e.end)}`}
            </span>
            <span className="ev-main">
              <b>{e.title}</b>
              <small>
                {e.company}
                {e.location ? `・${e.location}` : ''}
                {assigneeName(e.assigneeId) ? `・${assigneeName(e.assigneeId)}` : ''}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// 重なる時間の予定を横に並べる
function layoutDay(list) {
  const items = list.map((e) => ({ e, s: minutes(e.start), en: Math.max(minutes(e.end), minutes(e.start) + 20) })).sort((a, b) => a.s - b.s);
  const lanes = [];
  for (const it of items) {
    let lane = lanes.findIndex((end) => end <= it.s);
    if (lane < 0) {
      lane = lanes.length;
      lanes.push(0);
    }
    lanes[lane] = it.en;
    it.lane = lane;
  }
  for (const it of items)
    it.lanes = Math.max(
      1,
      items.filter((o) => o.s < it.en && o.en > it.s).reduce((m, o) => Math.max(m, o.lane + 1), 1),
    );
  return items;
}

function WeekView({ from, today, events, onCreate, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const scroller = useRef(null);
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR_PX * 7.5;
    const t = window.setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="week">
      <div className="wk-head">
        <div className="wk-gutter" />
        {days.map((d) => {
          const k = dkey(d);
          const hol = holidayName(k);
          return (
            <div key={k} className={`wk-day${k === today ? ' today' : ''}${d.getDay() === 0 || hol ? ' sun' : d.getDay() === 6 ? ' sat' : ''}`}>
              <small>{WEEK[d.getDay()]}</small>
              <b>{d.getDate()}</b>
              {hol && <em>{hol}</em>}
            </div>
          );
        })}
      </div>
      <div className="wk-all">
        <div className="wk-gutter">終日</div>
        {days.map((d) => {
          const k = dkey(d);
          return (
            <div key={k} className="wk-allcell">
              {eventsOn(events, k)
                .filter((e) => e.allDay)
                .map((e) => (
                  <Chip key={e.id} e={e} onOpen={onOpen} />
                ))}
            </div>
          );
        })}
      </div>
      <div className="wk-body" ref={scroller}>
        <div className="wk-grid" style={{ height: HOUR_PX * 24 }}>
          <div className="wk-gutter hours">
            {HOURS.map((h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : `${h}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const k = dkey(d);
            const timed = events.filter((e) => !e.allDay && e.start.slice(0, 10) === k);
            return (
              <div key={k} className="wk-col">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="wk-slot"
                    style={{ top: h * HOUR_PX, height: HOUR_PX }}
                    onClick={() => onCreate(k, h)}
                    aria-label={`${jpDate(k)} ${h}時に予定を追加`}
                  />
                ))}
                {layoutDay(timed).map(({ e, s, en, lane, lanes }) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`wk-ev ${COMPANY_CLASS[e.company]}`}
                    style={{ top: (s / 60) * HOUR_PX, height: Math.max(((en - s) / 60) * HOUR_PX - 2, 18), left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}
                    onClick={() => onOpen(e)}
                  >
                    <b>{e.title}</b>
                    <span>
                      {hm(e.start)}〜{hm(e.end)}
                    </span>
                  </button>
                ))}
                {k === today && <div className="now-line" style={{ top: (nowMin / 60) * HOUR_PX }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ListView({ from, today, events, onOpen, assigneeName }) {
  const days = Array.from({ length: 60 }, (_, i) => dkey(addDays(from, i)));
  const withEvents = days.map((k) => [k, eventsOn(events, k)]).filter(([, l]) => l.length);
  if (withEvents.length === 0) return <div className="empty">この期間の予定はありません。</div>;
  return (
    <div className="agenda">
      {withEvents.map(([k, list]) => (
        <section key={k} className={`ag-day${k === today ? ' today' : ''}`}>
          <h3>
            {jpDate(k)}
            {holidayName(k) && <small className="hol">{holidayName(k)}</small>}
          </h3>
          <EventRows list={list} onOpen={onOpen} assigneeName={assigneeName} />
        </section>
      ))}
    </div>
  );
}

function EventModal({ event, assignees, onClose, onSave, onDelete }) {
  const confirm = useConfirm();
  const split = (v, allDay) => (allDay ? [v.slice(0, 10), ''] : [v.slice(0, 10), v.slice(11, 16)]);
  const [f, setF] = useState(() => {
    const [sd, st] = split(event.start, event.allDay);
    const [ed, et] = split(event.end, event.allDay);
    return { ...event, sd, st: st || '10:00', ed, et: et || '11:00' };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => {
      const n = { ...x, [k]: v };
      if (k === 'sd' && x.ed < v) n.ed = v;
      if (k === 'st' && x.sd === x.ed && x.et <= v) {
        const h = Math.min(Number(v.slice(0, 2)) + 1, 23);
        n.et = `${pad(h)}:${v.slice(3, 5)}`;
      }
      return n;
    });
    setErr('');
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr('タイトルを入力してください');
    const payload = {
      id: f.id,
      title: f.title,
      allDay: f.allDay,
      start: f.allDay ? f.sd : `${f.sd}T${f.st}`,
      end: f.allDay ? f.ed : `${f.ed}T${f.et}`,
      company: f.company,
      assigneeId: f.assigneeId,
      location: f.location,
      memo: f.memo,
    };
    if (payload.end < payload.start) return setErr('終了は開始より後にしてください');
    setBusy(true);
    try {
      await onSave(payload);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const del = async () => {
    if (!(await confirm(`「${f.title}」を削除します。よろしいですか？`, { ok: '削除する', danger: true }))) return;
    setBusy(true);
    try {
      await onDelete(f.id);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-veil" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2>{f.id ? '予定の編集' : '予定を追加'}</h2>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          タイトル
          <input value={f.title} onChange={set('title')} autoFocus placeholder="例）清水社長と打ち合わせ" />
        </label>
        <label className="switch">
          <input type="checkbox" checked={f.allDay} onChange={(e) => setF((x) => ({ ...x, allDay: e.target.checked }))} />
          <span>終日</span>
        </label>
        <div className="dt-grid">
          <span className="dt-lbl">開始</span>
          <input type="date" value={f.sd} onChange={set('sd')} aria-label="開始日" />
          {!f.allDay && <input type="time" value={f.st} onChange={set('st')} aria-label="開始時刻" step="300" />}
          <span className="dt-lbl">終了</span>
          <input type="date" value={f.ed} onChange={set('ed')} aria-label="終了日" />
          {!f.allDay && <input type="time" value={f.et} onChange={set('et')} aria-label="終了時刻" step="300" />}
        </div>
        <div className="grid2">
          <label>
            会社
            <select value={f.company} onChange={set('company')}>
              {COMPANIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            担当者
            <select value={f.assigneeId} onChange={set('assigneeId')}>
              <option value="">なし</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          場所
          <input value={f.location} onChange={set('location')} placeholder="例）大津町 本社" />
        </label>
        <label>
          メモ
          <textarea rows={3} value={f.memo} onChange={set('memo')} />
        </label>
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <div className="modal-foot">
          {f.id ? (
            <button type="button" className="btn danger-ghost" onClick={del} disabled={busy}>
              削除
            </button>
          ) : (
            <span />
          )}
          <div className="row-gap">
            <button type="button" className="btn ghost" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn gold" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
