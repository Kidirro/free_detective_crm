import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { api, patch as apiPatch, post } from './api'

type Section = 'cases' | 'informants' | 'intel' | 'tasks'
type CaseStatus = 'Активно' | 'Ожидает' | 'Закрыто'
type Person = { id: number | string; name: string; callsign: string; initials: string }
type CaseFile = {
  id: string; dbId?: string; title: string; status: CaseStatus; priority: 'Критический' | 'Высокий' | 'Средний' | 'Низкий'
  lead: string; members: string[]; created: string; summary: string; location: string
  suspects: string[]; victims: string[]; witnesses: string[]; evidence: string[]; theories: string[]; report?: string
}
type Task = { id: number | string; title: string; due: string; assignee?: string; assigneeId?: string; done: boolean; report?: string; tag: string }

const seedPeople: Person[] = [
  { id: 1, name: 'Джозеф Блейк', callsign: 'Ворон', initials: 'ДБ' },
  { id: 2, name: 'Майя Торрес', callsign: 'Пантера', initials: 'МТ' },
  { id: 3, name: 'Ричард Норт', callsign: 'Филин', initials: 'РН' },
]

const seedCases: CaseFile[] = [
  { id: '0247', title: 'Мёртвый эфир', status: 'Активно', priority: 'Критический', lead: 'Ворон', members: ['Пантера', 'Филин'], created: '14.10.2026', location: 'Дел-Перро, пирс 4', summary: 'Радиоведущий исчез после ночного эфира. В студии обнаружены следы борьбы и кассета с зашифрованным сообщением.', suspects: ['Винсент Кроу', 'Неизвестный в сером'], victims: ['Артур Кейн'], witnesses: ['Лола Мартин, бармен'], evidence: ['Кассета №17', 'Окурок Morley', 'След обуви, 44 размер'], theories: ['Долг перед синдикатом', 'Инсценировка похищения'], report: '' },
  { id: '0241', title: 'Багровый прилив', status: 'Ожидает', priority: 'Высокий', lead: 'Пантера', members: ['Ворон'], created: '09.10.2026', location: 'Веспуччи-Бич', summary: 'Серия ограблений прибрежных складов. Все камеры отключались ровно на семь минут.', suspects: ['Банда Marabunta'], victims: ['West Coast Logistics'], witnesses: ['Охранник склада'], evidence: ['Гильза 9 мм', 'Запись диспетчера'], theories: ['Наводчик среди персонала'], report: '' },
  { id: '0232', title: 'Сломанные часы', status: 'Закрыто', priority: 'Средний', lead: 'Филин', members: [], created: '28.09.2026', location: 'Рокфорд-Хиллз', summary: 'Кража коллекции часов раскрыта. Имущество возвращено владельцу.', suspects: ['Генри Вейл'], victims: ['Саймон Грей'], witnesses: [], evidence: ['Запись камеры'], theories: ['Кража по заказу'], report: '' },
]

const informants = [
  { alias: 'Сверчок', reliability: 88, area: 'Строберри / Дэвис', status: 'НА СВЯЗИ', note: 'Уличные гонки, оружие, автомастерские', last: 'Вчера, 23:40' },
  { alias: 'Мадам Блю', reliability: 72, area: 'Вайнвуд', status: 'ЗАТИХ', note: 'Клубы, эскорт, городская элита', last: '12 окт., 02:15' },
  { alias: 'Кочегар', reliability: 94, area: 'Порт Лос-Сантоса', status: 'НА СВЯЗИ', note: 'Контрабанда, докеры, грузовые манифесты', last: 'Сегодня, 06:20' },
]

const gangs = [
  { name: 'Marabunta Grande', zone: 'Эль-Бурро / Ист-ЛС', threat: 'ВЫСОКАЯ', members: 34, color: '#65a9bd', note: 'Оружие, наркотрафик, вымогательство' },
  { name: 'The Lost MC', zone: 'Округ Блейн', threat: 'КРИТИЧЕСКАЯ', members: 51, color: '#bb5948', note: 'Контрабанда, оружие, заказные нападения' },
  { name: 'Families', zone: 'Чемберлен-Хиллз', threat: 'СРЕДНЯЯ', members: 27, color: '#69865a', note: 'Уличная торговля, угон транспорта' },
]

const seedTasks: Task[] = [
  { id: 1, title: 'Проверить камеры у пирса 4', due: 'Сегодня, 20:00', assignee: 'Ворон', done: false, tag: 'ДЕЛО #0247' },
  { id: 2, title: 'Встретиться со Сверчком', due: 'Сегодня, 23:30', assignee: 'Пантера', done: false, tag: 'ИНФОРМАТОРЫ' },
  { id: 3, title: 'Запросить архив звонков Кейна', due: 'Завтра, 12:00', done: false, tag: 'ДЕЛО #0247' },
  { id: 4, title: 'Сверить номера контейнеров', due: '18 окт.', assignee: 'Филин', done: true, tag: 'ПОРТ' },
]

const nav: { id: Section; label: string; mark: string }[] = [
  { id: 'cases', label: 'Дела', mark: '▰' }, { id: 'informants', label: 'Информаторы', mark: '♟' },
  { id: 'intel', label: 'Оперативные данные', mark: '◎' }, { id: 'tasks', label: 'Активные задачи', mark: '✓' },
]

function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(key) || '') } catch { return fallback } })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

function App() {
  const [people, setPeople] = useStored<Person[]>('db_people', seedPeople)
  const [cases, setCases] = useStored<CaseFile[]>('db_cases', seedCases)
  const [tasks, setTasks] = useStored<Task[]>('db_tasks', seedTasks)
  const [user, setUser] = useStored<Person | null>('db_session', null)
  const [section, setSection] = useState<Section>('cases')
  const [selected, setSelected] = useState<CaseFile | null>(null)
  const [modal, setModal] = useState<'profile' | 'login' | 'case' | 'task' | null>(null)
  const [filter, setFilter] = useState<'Все' | CaseStatus>('Все')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(false)

  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2600) }
  const current = user || people[0]
  const visibleCases = useMemo(() => cases.filter(c => (filter === 'Все' || c.status === filter) && (c.title + c.id).toLowerCase().includes(search.toLowerCase())), [cases, filter, search])

  useEffect(() => {
    async function loadServerData() {
      try {
        await api('/health'); setOnline(true)
        const me = await api<any>('/auth/me').catch(() => null)
        if (!me) return
        const [remotePeople, remoteCases, remoteTasks] = await Promise.all([api<any[]>('/users'), api<any[]>('/cases'), api<any[]>('/tasks')])
        const mappedPeople = remotePeople.map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, callsign: p.callsign, initials: `${p.firstName[0] || ''}${p.lastName[0] || ''}`.toUpperCase() }))
        const statuses: Record<string, CaseStatus> = { ACTIVE: 'Активно', WAITING: 'Ожидает', CLOSED: 'Закрыто' }
        const priorities: Record<string, CaseFile['priority']> = { CRITICAL: 'Критический', HIGH: 'Высокий', MEDIUM: 'Средний', LOW: 'Низкий' }
        setPeople(mappedPeople); setUser(mappedPeople.find(p => p.id === me.id) || mappedPeople[0])
        setCases(remoteCases.map(c => ({ id: String(c.number).padStart(4, '0'), dbId: c.id, title: c.title, status: statuses[c.status], priority: priorities[c.priority], lead: c.lead.callsign, members: [], created: new Date(c.createdAt).toLocaleDateString('ru-RU'), location: c.location || 'Не установлено', summary: c.summary, suspects: c.suspects, victims: c.victims, witnesses: c.witnesses, evidence: c.evidence, theories: c.theories, report: c.report || '' })))
        setTasks(remoteTasks.map(t => ({ id: t.id, title: t.title, due: t.dueLabel || 'Без срока', tag: t.tag, done: t.status === 'DONE', report: t.report, assignee: t.assignee?.callsign, assigneeId: t.assigneeId })))
      } catch { setOnline(false) }
    }
    void loadServerData()
  }, [])

  async function createProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name')); const callsign = String(fd.get('callsign'))
    let id: string | number = Date.now()
    if (online) { try { id = (await post<any>('/auth/register', { name, callsign, secretCode: String(fd.get('code')) })).id } catch (error) { return notify(error instanceof Error ? error.message : 'Не удалось создать профиль') } }
    else if (fd.get('code') !== 'NOIR-47') return notify('Секретный код не принят')
    const p = { id, name, callsign, initials: name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() }
    setPeople([...people, p]); setUser(p); setModal(null); notify(`Профиль «${callsign}» создан`)
  }

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget)
    try {
      const remote = await post<any>('/auth/login', { callsign: String(fd.get('callsign')), secretCode: String(fd.get('code')) })
      const p = { id: remote.id, name: `${remote.firstName} ${remote.lastName}`, callsign: remote.callsign, initials: `${remote.firstName[0] || ''}${remote.lastName[0] || ''}`.toUpperCase() }
      setUser(p); if (!people.some(x => x.id === p.id)) setPeople([...people, p]); setModal(null); notify(`Добро пожаловать, ${p.callsign}`); window.setTimeout(() => window.location.reload(), 400)
    } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось войти') }
  }

  async function createCase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); const now = new Date()
    const lead = String(fd.get('lead')); const priorityMap: Record<string,string> = { Критический:'CRITICAL', Высокий:'HIGH', Средний:'MEDIUM', Низкий:'LOW' }
    const c: CaseFile = { id: String(Math.max(...cases.map(x => +x.id), 0) + 1).padStart(4, '0'), title: String(fd.get('title')), status: 'Активно', priority: fd.get('priority') as CaseFile['priority'], lead, members: [], created: now.toLocaleDateString('ru-RU'), location: String(fd.get('location') || 'Не установлено'), summary: String(fd.get('summary')), suspects: [], victims: [], witnesses: [], evidence: [], theories: [], report: '' }
    if (online) { try { const remote = await post<any>('/cases', { title:c.title, summary:c.summary, location:c.location, priority:priorityMap[c.priority], leadId:people.find(p=>p.callsign===lead)?.id }); c.id=String(remote.number).padStart(4,'0'); c.dbId=remote.id } catch(error) { return notify(error instanceof Error ? error.message : 'Ошибка сервера') } }
    setCases([c, ...cases]); setModal(null); setSelected(c); notify(`Дело #${c.id} заведено`)
  }

  async function createTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget)
    const item: Task = { id: Date.now(), title: String(fd.get('title')), due: String(fd.get('due')), tag: String(fd.get('tag') || 'ОБЩЕЕ'), done: false }
    if (online) { try { item.id=(await post<any>('/tasks', { title:item.title, dueLabel:item.due, tag:item.tag })).id } catch(error) { return notify(error instanceof Error ? error.message : 'Ошибка сервера') } }
    setTasks([item, ...tasks]); setModal(null); notify('Задача добавлена')
  }

  function saveReport(value: string) {
    if (!selected) return; const updated = { ...selected, report: value }; setSelected(updated); setCases(cases.map(c => c.id === updated.id ? updated : c))
    if (online && selected.dbId) void apiPatch(`/cases/${selected.dbId}`, { report: value }).catch(() => notify('Не удалось сохранить отчёт'))
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-eye">◉</div><div><small>PRIVATE</small><b>BLACKWOOD</b><span>DETECTIVE BUREAU</span></div></div>
      <div className="side-label">КАРТОТЕКА</div>
      <nav>{nav.map(n => <button key={n.id} className={section === n.id ? 'active' : ''} onClick={() => { setSection(n.id); setSelected(null) }}><i>{n.mark}</i>{n.label}{n.id === 'tasks' && <em>{tasks.filter(t => !t.done).length}</em>}</button>)}</nav>
      <div className="side-label operatives">ОПЕРАТИВНИКИ <button onClick={() => setModal('profile')}>＋</button></div>
      <div className="people">{people.map(p => <button className={current.id === p.id ? 'person current' : 'person'} key={p.id} onClick={() => setUser(p)}><span>{p.initials}</span><div><b>{p.callsign}</b><small>{p.name}</small></div><i>●</i></button>)}</div>
      <div className="user-card"><span>{current.initials}</span><div><b>{current.callsign}</b><small>ДЕТЕКТИВ · {online ? 'СЕРВЕР' : 'ЛОКАЛЬНО'}</small></div><button onClick={() => setModal('login')} title="Сменить профиль">↪</button></div>
    </aside>

    <main>
      <header><div className="crumbs">АРХИВ <span>/</span> {selected ? `ДЕЛО #${selected.id}` : nav.find(n => n.id === section)?.label.toUpperCase()}</div><div className="header-tools"><label className="search">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по архиву…" /></label><span className="date">19 ОКТ 2026<br/><small>03:47 · LOS SANTOS</small></span><button className="bell">♢<i/></button></div></header>
      <section className="workspace">
        {section === 'cases' && (selected ? <CaseBoard file={selected} onBack={() => setSelected(null)} onReport={saveReport} /> : <CasesPage items={visibleCases} filter={filter} setFilter={setFilter} onSelect={setSelected} onAdd={() => setModal('case')} />)}
        {section === 'informants' && <InformantsPage onAdd={() => notify('Карточка информатора подготовлена')} />}
        {section === 'intel' && <IntelPage />}
        {section === 'tasks' && <TasksPage tasks={tasks} setTasks={setTasks} current={current} onAdd={() => setModal('task')} notify={notify} />}
      </section>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><div className="modal" onMouseDown={e => e.stopPropagation()}><button className="modal-x" onClick={() => setModal(null)}>×</button>{modal === 'profile' && <ProfileForm submit={createProfile}/>} {modal === 'login' && <LoginForm submit={login}/>} {modal === 'case' && <CaseForm submit={createCase} people={people}/>} {modal === 'task' && <TaskForm submit={createTask}/>}</div></div>}
    {toast && <div className="toast"><b>✓</b>{toast}</div>}
  </div>
}

function PageHead({ eyebrow, title, action, actionText = '+  НОВАЯ ЗАПИСЬ' }: { eyebrow: string; title: string; action?: () => void; actionText?: string }) { return <div className="page-head"><div><small>{eyebrow}</small><h1>{title}</h1></div>{action && <button className="primary" onClick={action}>{actionText}</button>}</div> }

function CasesPage({ items, filter, setFilter, onSelect, onAdd }: { items: CaseFile[]; filter: string; setFilter: (v: any) => void; onSelect: (c: CaseFile) => void; onAdd: () => void }) {
  const counts = (s: string) => s === 'Все' ? items.length : seedCases.filter(c => c.status === s).length
  return <><PageHead eyebrow="ДОСЬЕ И РАССЛЕДОВАНИЯ" title="Дела" action={onAdd} actionText="＋  ЗАВЕСТИ ДЕЛО"/><div className="stats"><div><small>АКТИВНЫХ ДЕЛ</small><b>{String(items.filter(x => x.status === 'Активно').length).padStart(2,'0')}</b><span>↑ 2 за неделю</span></div><div><small>ОЖИДАЮТ ДАННЫХ</small><b>{String(items.filter(x => x.status === 'Ожидает').length).padStart(2,'0')}</b><span className="amber">Требуют внимания</span></div><div><small>ЗАКРЫТО ЗА МЕСЯЦ</small><b>12</b><span>↑ 18% к сентябрю</span></div><div className="quote">«У каждого города есть свои секреты.<br/>Наша работа — заставить их говорить.»<small>— АРХИВ БЮРО, 1987</small></div></div><div className="tabs">{(['Все','Активно','Ожидает','Закрыто'] as const).map(x => <button className={filter === x ? 'active' : ''} onClick={() => setFilter(x)} key={x}>{x.toUpperCase()} <span>{counts(x)}</span></button>)}</div><div className="case-grid">{items.map((c, i) => <article className="case-folder" key={c.id} onClick={() => onSelect(c)} style={{ '--tilt': `${i % 2 ? 0.35 : -0.2}deg` } as React.CSSProperties}><div className="folder-tab">ДЕЛО № {c.id}</div><div className="folder-paper"><div className="case-top"><span className={`stamp ${c.status}`}>{c.status}</span><small>{c.created}</small></div><h2>{c.title}</h2><p>{c.summary}</p><div className="case-location">⌖ {c.location}</div><div className="case-bottom"><div className="avatars">{[c.lead,...c.members].slice(0,3).map(x => <span key={x}>{x.slice(0,1)}</span>)}</div><span>ВЕДУЩИЙ: <b>{c.lead}</b></span><em className={`priority p-${c.priority}`}>{c.priority}</em></div></div></article>)}</div></>
}

function CaseBoard({ file, onBack, onReport }: { file: CaseFile; onBack: () => void; onReport: (v: string) => void }) { return <><button className="back" onClick={onBack}>← НАЗАД К ДЕЛАМ</button><div className="case-title"><div><small>ДЕЛО № {file.id} · {file.created}</small><h1>{file.title}</h1><p>ВЕДУЩИЙ: <b>{file.lead}</b> · <span>{file.priority.toUpperCase()} ПРИОРИТЕТ</span></p></div><button className="secondary" onClick={() => window.print()}>▣ ПЕЧАТЬ ДОСЬЕ</button></div><div className="evidence-board"><svg className="threads" viewBox="0 0 1200 700" preserveAspectRatio="none"><path d="M215 190 L580 105 L955 200 L850 490 L420 530 L215 190 M580 105 L420 530 M955 200 L420 530"/><circle cx="215" cy="190" r="5"/><circle cx="580" cy="105" r="5"/><circle cx="955" cy="200" r="5"/></svg><Note cls="main-note" pin="red" title="СВОДКА" lines={[file.summary, `МЕСТО: ${file.location}`]}/><ListNote cls="suspects-note" title="ПОДОЗРЕВАЕМЫЕ" items={file.suspects}/><ListNote cls="evidence-note" title="УЛИКИ" items={file.evidence}/><ListNote cls="witness-note" title="СВИДЕТЕЛИ / ЖЕРТВЫ" items={[...file.witnesses, ...file.victims]}/><ListNote cls="theory-note" title="ВЕРСИИ" items={file.theories}/><div className="photo-note"><div className="night-photo"><span>LOS SANTOS<br/><b>{file.location}</b></span></div><small>СНИМОК С МЕСТА · ПЛЁНКА 04</small></div></div><div className="report-box"><div><small>ОТЧЁТ ПО ДЕЛУ</small><h3>Рабочие заметки детектива</h3></div><textarea value={file.report} onChange={e => onReport(e.target.value)} placeholder="Зафиксируйте ход расследования, результаты опросов и ссылки на материалы…"/><div className="report-foot"><span>Сохраняется автоматически</span><input placeholder="Ссылка на презентацию / отчёт" defaultValue={file.report?.startsWith('http') ? file.report : ''}/></div></div></> }

function Note({ cls, title, lines }: { cls: string; pin?: string; title: string; lines: string[] }) { return <div className={`board-note ${cls}`}><i/><h3>{title}</h3>{lines.map((x,i) => <p key={i}>{x}</p>)}</div> }
function ListNote({ cls, title, items }: { cls: string; title: string; items: string[] }) { return <div className={`board-note ${cls}`}><i/><h3>{title}</h3>{items.length ? <ul>{items.map(x => <li key={x}>{x}</li>)}</ul> : <button>＋ ДОБАВИТЬ</button>}</div> }

function InformantsPage({ onAdd }: { onAdd: () => void }) { return <><PageHead eyebrow="КОНФИДЕНЦИАЛЬНЫЕ ИСТОЧНИКИ" title="Информаторы" action={onAdd} actionText="＋  НОВЫЙ КОНТАКТ"/><div className="warning-strip">⚠ ДОСТУП ОГРАНИЧЕН <span>Разглашение личности источника карается исключением из бюро</span></div><div className="informant-grid">{informants.map((x,i) => <article className="informant" key={x.alias}><div className="portrait">{['♟','♞','♜'][i]}<span>ЛИЧНОСТЬ СКРЫТА</span></div><div className="clip"/><small>КОДОВОЕ ИМЯ</small><h2>«{x.alias}»</h2><p>{x.note}</p><dl><div><dt>РАЙОН</dt><dd>{x.area}</dd></div><div><dt>НАДЁЖНОСТЬ</dt><dd>{x.reliability}% <i style={{width:`${x.reliability}%`}}/></dd></div><div><dt>ПОСЛЕДНИЙ КОНТАКТ</dt><dd>{x.last}</dd></div></dl><span className={`contact ${x.status === 'ЗАТИХ' ? 'quiet':''}`}>● {x.status}</span></article>)}</div></> }

function IntelPage() { return <><PageHead eyebrow="КРИМИНАЛЬНАЯ КАРТА ЛОС-САНТОСА" title="Оперативные данные"/><div className="intel-layout"><div className="map-panel"><div className="map-grid"/><span className="district d1">●<b>MARABUNTA</b></span><span className="district d2">●<b>FAMILIES</b></span><span className="district d3">●<b>THE LOST</b></span><div className="map-caption">КАРТА ВЛИЯНИЯ · ОБНОВЛЕНО 18.10.26</div></div><div className="gang-list">{gangs.map(g => <article key={g.name}><i style={{background:g.color}}/><div><small>{g.zone}</small><h3>{g.name}</h3><p>{g.note}</p></div><dl><dt>УГРОЗА</dt><dd>{g.threat}</dd><dt>ЧЛЕНОВ</dt><dd>{g.members}</dd></dl></article>)}</div></div></> }

function TasksPage({ tasks, setTasks, current, onAdd, notify }: { tasks: Task[]; setTasks: (t: Task[]) => void; current: Person; onAdd: () => void; notify: (s:string)=>void }) { return <><PageHead eyebrow="ОПЕРАТИВНАЯ РАБОТА" title="Активные задачи" action={onAdd} actionText="＋  ПОСТАВИТЬ ЗАДАЧУ"/><div className="task-board"><section><h3>К ВЫПОЛНЕНИЮ <span>{tasks.filter(t=>!t.done).length}</span></h3>{tasks.filter(t=>!t.done).map(t => <article className="task" key={t.id}><button className="check" onClick={() => {setTasks(tasks.map(x=>x.id===t.id?{...x,done:true}:x));notify('Задача выполнена')}}/><div><small>{t.tag}</small><h4>{t.title}</h4><p>СРОК: <b>{t.due}</b></p></div>{t.assignee ? <span className="assigned">{t.assignee.slice(0,1)}<i>{t.assignee}</i></span> : <button className="take" onClick={()=>setTasks(tasks.map(x=>x.id===t.id?{...x,assignee:current.callsign}:x))}>ВЗЯТЬ</button>}</article>)}</section><section className="done"><h3>ВЫПОЛНЕНО <span>{tasks.filter(t=>t.done).length}</span></h3>{tasks.filter(t=>t.done).map(t => <article className="task" key={t.id}><button className="check checked">✓</button><div><small>{t.tag}</small><h4>{t.title}</h4><p>{t.report || 'Выполнено. Отчёт ожидает проверки.'}</p></div><span className="assigned">{(t.assignee||'—').slice(0,1)}<i>{t.assignee}</i></span></article>)}</section></div></> }

function ProfileForm({ submit }: { submit: (e: FormEvent<HTMLFormElement>) => void }) { return <form onSubmit={submit}><small className="form-kicker">ЛИЧНОЕ ДЕЛО ОПЕРАТИВНИКА</small><h2>Новый профиль</h2><p className="form-desc">Введите данные сотрудника. Для допуска потребуется секретный код бюро.</p><label>ИМЯ И ФАМИЛИЯ<input name="name" required placeholder="Джозеф Блейк"/></label><label>ПОЗЫВНОЙ<input name="callsign" required placeholder="Ворон"/></label><label>СЕКРЕТНЫЙ КОД<input name="code" required type="password" placeholder="•••••••"/></label><p className="hint">Для демонстрации: <b>NOIR-47</b></p><button className="primary wide">СОЗДАТЬ ПРОФИЛЬ</button></form> }
function LoginForm({ submit }: { submit: (e: FormEvent<HTMLFormElement>) => void }) { return <form onSubmit={submit}><small className="form-kicker">ЗАКРЫТЫЙ КОНТУР BLACKWOOD</small><h2>Вход в архив</h2><p className="form-desc">Предъявите позывной и выданный бюро секретный код.</p><label>ПОЗЫВНОЙ<input name="callsign" required autoFocus placeholder="Ворон"/></label><label>СЕКРЕТНЫЙ КОД<input name="code" required type="password" placeholder="•••••••"/></label><button className="primary wide">ПОЛУЧИТЬ ДОСТУП</button></form> }
function CaseForm({ submit, people }: { submit: (e: FormEvent<HTMLFormElement>) => void; people: Person[] }) { return <form onSubmit={submit}><small className="form-kicker">РЕГИСТРАЦИЯ МАТЕРИАЛОВ</small><h2>Завести дело</h2><div className="form-row"><label>НАЗВАНИЕ<input name="title" required placeholder="Кодовое название"/></label><label>ПРИОРИТЕТ<select name="priority"><option>Критический</option><option>Высокий</option><option>Средний</option><option>Низкий</option></select></label></div><div className="form-row"><label>ВЕДУЩИЙ<select name="lead">{people.map(p=><option key={p.id}>{p.callsign}</option>)}</select></label><label>МЕСТО<input name="location" placeholder="Район / адрес"/></label></div><label>КРАТКАЯ ИНФОРМАЦИЯ<textarea name="summary" required placeholder="Что произошло и что известно на данный момент…"/></label><button className="primary wide">ЗАВЕСТИ ДЕЛО</button></form> }
function TaskForm({ submit }: { submit: (e: FormEvent<HTMLFormElement>) => void }) { return <form onSubmit={submit}><small className="form-kicker">РАСПОРЯЖЕНИЕ</small><h2>Новая задача</h2><label>ЧТО НУЖНО СДЕЛАТЬ<input name="title" required placeholder="Описание задачи"/></label><div className="form-row"><label>СРОК<input name="due" required placeholder="Сегодня, 22:00"/></label><label>МЕТКА<input name="tag" placeholder="ДЕЛО #0247"/></label></div><button className="primary wide">ПОСТАВИТЬ ЗАДАЧУ</button></form> }

export default App
