import { AGE_UP, BUILD_MENU, BUILDINGS, Cost, NODES, RESOURCE_TYPES, UNITS, UnitType } from '../config/balance';
import { AI_CONFIGS, Difficulty } from '../config/ai';
import { canAgeUp, canTrain, cancelQueue, checkBuildable, commandStop, deleteEntity, researchAge, train } from '../sim/commands';
import { Building, Entity, GameEvent, HUMAN, Unit } from '../sim/types';
import type { World } from '../sim/World';
import type { RtsInput } from '../input/RtsInput';
import { UI_ICONS, buildingIconUrl, unitIconStyle } from '../render/assets';
import { Minimap } from './Minimap';

export interface HudHost {
    world: World | null;
    rts: RtsInput | null;
    paused: boolean;
    startGame(d: Difficulty): void;
    saveGame(): boolean;
    loadGame(): boolean;
    hasSave(): boolean;
    quitToMenu(): void;
    setPaused(p: boolean): void;
    toggleMute(): boolean;
    jumpTo(x: number, y: number): void;
    playSound(name: string): void;
}

interface Button {
    key: string;
    icon: string;
    title: string;
    lines: string[];
    enabled: boolean;
    reason?: string;
    onClick: () => void;
}

const STATE_TEXT: Record<string, string> = {
    idle: 'Đang rảnh', move: 'Đang di chuyển', gather: 'Đang khai thác', return: 'Đang mang tài nguyên về',
    build: 'Đang xây', attack: 'Đang tấn công', dead: 'Đã chết',
};
const RES_NAME: Record<string, string> = { wood: 'Gỗ', food: 'Thức ăn', gold: 'Vàng', stone: 'Đá' };

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export function costHtml(cost: Cost): string {
    return RESOURCE_TYPES.filter(t => cost[t]).map(t => `<span class="cost"><img src="${UI_ICONS[t]}">${cost[t]}</span>`).join(' ');
}

/** Giao diện DOM: thanh tài nguyên, bảng thông tin/lệnh, minimap, thông báo, các màn hình menu. */
export class Hud {
    root: HTMLDivElement;
    minimap: Minimap;
    private buttons: Button[] = [];
    private buttonSig = '';
    private infoSig = '';
    private timer = 0;
    private lastAlert: { x: number; y: number } | null = null;
    private difficulty: Difficulty = 'normal';

    constructor(private host: HudHost) {
        this.root = document.createElement('div');
        this.root.id = 'hud';
        this.root.innerHTML = `
<div id="topbar" class="panel">
  ${RESOURCE_TYPES.map(t => `<div class="res" data-tip="${RES_NAME[t]}"><img src="${UI_ICONS[t]}"><span id="res-${t}">0</span></div>`).join('')}
  <div class="res" data-tip="Dân số / tối đa"><img src="${UI_ICONS.pop}"><span id="res-pop">0/0</span></div>
  <div id="age"></div>
  <div class="spacer"></div>
  <div id="clock">00:00</div>
  <button id="btn-idle" data-tip="Tìm pawn đang rảnh (phím .)">Pawn rảnh <b id="idle-count">0</b></button>
  <button id="btn-menu" data-tip="Tạm dừng / Menu (P)">❚❚ Menu</button>
</div>
<div id="messages"></div>
<div id="bottom" class="panel">
  <canvas id="minimap"></canvas>
  <div id="info"></div>
  <div id="commands"></div>
</div>
<div id="tooltip"></div>
<div id="screen" class="hidden"></div>`;
        document.body.appendChild(this.root);
        this.minimap = new Minimap($(this.root, '#minimap'), (x, y) => host.jumpTo(x, y));
        $(this.root, '#btn-idle').onclick = () => host.rts?.selectIdlePawn();
        $(this.root, '#btn-menu').onclick = () => this.showPause();
        this.setupTooltips();
    }

    // ---------- Tooltip ----------

    private setupTooltips(): void {
        const tip = $(this.root, '#tooltip');
        this.root.addEventListener('mouseover', e => {
            const el = (e.target as HTMLElement).closest('[data-tip],[data-btn]') as HTMLElement | null;
            if (!el) { tip.style.display = 'none'; return; }
            const btn = el.dataset.btn ? this.buttons.find(b => b.key === el.dataset.btn) : null;
            tip.innerHTML = btn ? `<b>${btn.title}</b>${btn.lines.map(l => `<div>${l}</div>`).join('')}` : el.dataset.tip!;
            tip.style.display = 'block';
            const r = el.getBoundingClientRect();
            const tr = tip.getBoundingClientRect();
            tip.style.left = `${Math.min(window.innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2))}px`;
            tip.style.top = `${r.top > window.innerHeight / 2 ? r.top - tr.height - 8 : r.bottom + 8}px`;
        });
        this.root.addEventListener('mouseleave', () => { tip.style.display = 'none'; }, true);
    }

    // ---------- Cập nhật ----------

    update(dt: number): void {
        const w = this.host.world;
        if (!w) return;
        this.timer -= dt;
        if (this.timer > 0) return;
        this.timer = 0.15;
        const p = w.players[HUMAN];
        for (const t of RESOURCE_TYPES) $(this.root, `#res-${t}`).textContent = String(Math.floor(p.resources[t]));
        const pop = $(this.root, '#res-pop');
        pop.textContent = `${p.pop}/${p.popCap}`;
        pop.classList.toggle('full', p.pop >= p.popCap);
        $(this.root, '#age').textContent = `Thời đại ${p.age}`;
        const s = Math.floor(w.time);
        $(this.root, '#clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        $(this.root, '#idle-count').textContent = String(w.units.filter(u => u.owner === HUMAN && u.type === 'pawn' && !u.order).length);
        this.refreshPanels();
    }

    drawMinimap(view: { x: number; y: number; width: number; height: number }): void {
        this.minimap.draw(view);
    }

    /** Vẽ lại bảng thông tin và bảng lệnh (chỉ thay DOM khi nội dung đổi). */
    refreshPanels(): void {
        const w = this.host.world;
        const input = this.host.rts;
        if (!w || !input) return;
        const sel = [...input.selection].map(id => w.get(id)).filter((e): e is Entity => !!e);
        const live: Record<string, string> = {};
        const info = this.infoHtml(sel, live);
        const el = $(this.root, '#info');
        if (info !== this.infoSig) {
            this.infoSig = info;
            el.innerHTML = info;
            el.querySelectorAll<HTMLElement>('[data-cancel]').forEach(q => {
                q.onclick = () => {
                    const b = sel[0] as Building;
                    if (cancelQueue(w, HUMAN, b.id, Number(q.dataset.cancel)).ok) this.host.playSound('order');
                    this.refreshPanels();
                };
            });
        }
        // Chỉ cập nhật số liệu động, không dựng lại DOM (để bấm được ổn định).
        el.querySelectorAll<HTMLElement>('[data-live]').forEach(n => {
            const v = live[n.dataset.live!] ?? '';
            if (n.dataset.live === 'hpw') n.style.width = v;
            else if (n.textContent !== v) n.textContent = v;
        });
        this.buttons = this.commandButtons(w, sel);
        const sig = this.buttons.map(b => `${b.key}:${b.enabled}:${b.lines.join('|')}`).join(',');
        if (sig === this.buttonSig) return;
        const structural = this.buttons.map(b => b.key).join(',') !== this.buttonSig.split(',').map(s => s.split(':')[0]).join(',');
        this.buttonSig = sig;
        const box = $(this.root, '#commands');
        if (structural) {
            box.innerHTML = this.buttons.map(b => `<button class="cmd" data-btn="${b.key}">${b.icon}<span>${b.title}</span></button>`).join('');
            box.querySelectorAll<HTMLButtonElement>('button.cmd').forEach(el => {
                el.onclick = () => {
                    const b = this.buttons.find(x => x.key === el.dataset.btn);
                    if (!b) return;
                    if (!b.enabled) { this.host.playSound('error'); w.message(HUMAN, b.reason ?? 'Không khả dụng', 'btn-' + b.key, 0.5); return; }
                    b.onClick();
                    this.refreshPanels();
                };
            });
        }
        box.querySelectorAll<HTMLButtonElement>('button.cmd').forEach(el => {
            const b = this.buttons.find(x => x.key === el.dataset.btn);
            el.classList.toggle('disabled', !b?.enabled);
        });
    }

    /** HTML cấu trúc của bảng thông tin; số liệu thay đổi ghi vào `live` (gắn qua data-live). */
    private infoHtml(sel: Entity[], live: Record<string, string>): string {
        if (!sel.length) return '<div class="hint">Chuột trái: chọn · Kéo: chọn nhiều · Chuột phải: ra lệnh<br>WASD/mũi tên: camera · Ctrl+số: tạo nhóm · số: gọi nhóm · H: nhà chính · . : pawn rảnh · Space: tới chỗ bị tấn công</div>';
        if (sel.length > 1) {
            const counts = new Map<string, number>();
            for (const e of sel) if (e.kind === 'unit') counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
            return `<div class="title">${sel.length} đơn vị</div><div class="group">${[...counts].map(([t, n]) =>
                `<div class="unit-chip"><i class="sprite" style='${unitIconStyle(t as UnitType)}'></i>${UNITS[t as UnitType].name} ×${n}</div>`).join('')}</div>`;
        }
        const e = sel[0];
        if (e.kind === 'node') {
            live.amount = String(Math.ceil(e.amount));
            return `<div class="title">${NODES[e.type].name}</div><div>${RES_NAME[NODES[e.type].resource]} còn lại: <b data-live="amount"></b></div>`;
        }
        const own = e.owner === HUMAN ? '' : ' <span class="enemy">(địch)</span>';
        live.hpw = `${(e.hp / e.maxHp) * 100}%`;
        live.hp = `${Math.ceil(e.hp)}/${e.maxHp}`;
        const hp = '<div class="hpbar"><i data-live="hpw"></i><span data-live="hp"></span></div>';
        if (e.kind === 'unit') return this.unitInfo(e, own, hp, live);
        return this.buildingInfo(e, own, hp, live);
    }

    private unitInfo(u: Unit, own: string, hp: string, live: Record<string, string>): string {
        const s = UNITS[u.type];
        live.state = STATE_TEXT[u.state];
        live.carry = u.carry > 0 && u.carryType ? `Đang mang: ${Math.floor(u.carry)} ${RES_NAME[u.carryType]}` : '';
        return `<div class="row"><i class="portrait sprite" style='${unitIconStyle(u.type)}'></i><div>
            <div class="title">${s.name}${own}</div>${hp}
            <div>Sát thương ${s.damage} · Tầm ${s.ranged ? s.range : 'cận chiến'} · <span data-live="state"></span></div><div data-live="carry"></div></div></div>`;
    }

    private buildingInfo(b: Building, own: string, hp: string, live: Record<string, string>): string {
        const s = BUILDINGS[b.type];
        let body = '';
        if (!b.built) {
            live.progress = `${Math.floor((b.progress / s.buildTime) * 100)}%`;
            body = '<div>Đang xây: <span data-live="progress"></span></div>';
        } else if (b.type === 'farm') {
            live.food = String(Math.ceil(b.food));
            body = '<div>Thức ăn còn lại: <b data-live="food"></b></div>';
        } else if (s.popBonus) body = `<div>+${s.popBonus} dân</div>`;
        if (s.accepts && b.built) body += `<div>Nhận: ${s.accepts.map(r => RES_NAME[r]).join(', ')}</div>`;
        if (b.owner === HUMAN && b.queue.length) {
            live.q0 = b.queueBlocked ? 'Thiếu dân' : `${Math.floor((b.queueTime / b.queue[0].time) * 100)}%`;
            body += `<div class="queue">${b.queue.map((q, i) => {
                const icon = q.kind === 'unit' ? `<i class="sprite" style='${unitIconStyle(q.unit!)}'></i>` : '<i class="age-icon">II</i>';
                return `<div class="qitem" data-cancel="${i}" data-tip="Bấm để huỷ, hoàn lại tài nguyên">${icon}${i === 0 ? '<em data-live="q0"></em>' : ''}</div>`;
            }).join('')}</div>`;
        }
        const icon = buildingIconUrl(b.type);
        return `<div class="row">${icon ? `<img class="portrait" src="${icon}">` : '<i class="portrait placeholder">Ruộng</i>'}<div>
            <div class="title">${s.name}${own}</div>${hp}${body}</div></div>`;
    }

    private commandButtons(w: World, sel: Entity[]): Button[] {
        const own = sel.filter(e => e.owner === HUMAN);
        if (!own.length) return [];
        const out: Button[] = [];
        const units = own.filter((e): e is Unit => e.kind === 'unit');
        const input = this.host.rts!;
        if (units.some(u => u.type === 'pawn')) {
            for (const t of BUILD_MENU) {
                const s = BUILDINGS[t];
                const check = checkBuildable(w, HUMAN, t);
                const url = buildingIconUrl(t);
                out.push({
                    key: 'build-' + t,
                    icon: url ? `<img src="${url}">` : '<i class="placeholder">Ruộng</i>',
                    title: s.name,
                    lines: [costHtml(s.cost), describeBuilding(t), ...(check.ok ? [] : [`<span class="bad">${check.msg}</span>`])],
                    enabled: check.ok,
                    reason: check.msg,
                    onClick: () => input.startPlacement(t),
                });
            }
        }
        if (units.length && units.some(u => u.type !== 'pawn' || u.order)) {
            out.push({ key: 'stop', icon: `<img src="${UI_ICONS.cancel}">`, title: 'Dừng', lines: ['Dừng lệnh hiện tại'], enabled: true, onClick: () => commandStop(w, HUMAN, units.map(u => u.id)) });
        }
        if (own.length === 1 && own[0].kind === 'building') {
            const b = own[0];
            const s = BUILDINGS[b.type];
            if (b.built) {
                for (const t of s.trains ?? []) {
                    const u = UNITS[t];
                    const check = canTrain(w, HUMAN, b, t);
                    out.push({
                        key: 'train-' + t,
                        icon: `<i class="sprite" style='${unitIconStyle(t)}'></i>`,
                        title: u.name,
                        lines: [costHtml(u.cost), `Máu ${u.hp} · Sát thương ${u.damage} · ${u.ranged ? 'Tầm xa ' + u.range : 'Cận chiến'} · ${u.trainTime}s`, ...(check.ok ? [] : [`<span class="bad">${check.msg}</span>`])],
                        enabled: check.ok,
                        reason: check.msg,
                        onClick: () => { if (train(w, HUMAN, b.id, t).ok) this.host.playSound('order'); },
                    });
                }
                if (s.canAgeUp && w.players[HUMAN].age < 2) {
                    const check = canAgeUp(w, HUMAN, b);
                    out.push({
                        key: 'age', icon: '<i class="age-icon">II</i>', title: AGE_UP.name,
                        lines: [costHtml(AGE_UP.cost), `Mở Trường bắn, Chuồng ngựa, Tháp canh · ${AGE_UP.time}s`, ...(check.ok ? [] : [`<span class="bad">${check.msg}</span>`])],
                        enabled: check.ok,
                        reason: check.msg,
                        onClick: () => { if (researchAge(w, HUMAN, b.id).ok) this.host.playSound('order'); },
                    });
                }
            }
        }
        const delTitle = own.length === 1 && own[0].kind === 'building' && !own[0].built ? 'Huỷ xây' : 'Huỷ (Del)';
        const delLine = own.length === 1 && own[0].kind === 'building' && !own[0].built ? 'Huỷ công trình, hoàn lại toàn bộ tài nguyên' : 'Xoá đối tượng đang chọn';
        out.push({
            key: 'delete', icon: `<img src="${UI_ICONS.cancel}">`, title: delTitle, lines: [delLine], enabled: true,
            onClick: () => { for (const e of own) deleteEntity(w, HUMAN, e.id); input.setSelection([]); },
        });
        return out;
    }

    // ---------- Sự kiện / thông báo ----------

    handleEvents(events: GameEvent[]): void {
        for (const e of events) {
            switch (e.type) {
                case 'message':
                    if (e.owner === HUMAN) this.toast(e.text, e.level);
                    break;
                case 'attacked':
                    this.lastAlert = { x: e.x, y: e.y };
                    this.minimap.ping(e.x, e.y);
                    this.host.playSound('alert');
                    break;
                case 'built': if (e.owner === HUMAN) this.host.playSound('built'); break;
                case 'trained': if (e.owner === HUMAN) this.host.playSound('trained'); break;
                case 'age': if (e.owner === HUMAN) this.host.playSound('age'); break;
                case 'gameover': this.showGameOver(e.winner); break;
            }
        }
    }

    jumpToAlert(): void {
        if (this.lastAlert) this.host.jumpTo(this.lastAlert.x, this.lastAlert.y);
    }

    toast(text: string, level: 'info' | 'warn' = 'info'): void {
        const box = $(this.root, '#messages');
        // Thông báo trùng nội dung: đưa cái cũ xuống cuối thay vì thêm mới.
        const old = [...box.children].find(c => c.textContent === text);
        if (old) old.remove();
        const el = document.createElement('div');
        el.className = `msg ${level}`;
        el.textContent = text;
        box.appendChild(el);
        while (box.children.length > 4) box.firstChild!.remove();
        setTimeout(() => el.classList.add('fade'), 3500);
        setTimeout(() => el.remove(), 4200);
    }

    // ---------- Màn hình ----------

    private screen(html: string): HTMLElement {
        const s = $(this.root, '#screen');
        s.innerHTML = `<div class="dialog">${html}</div>`;
        s.classList.remove('hidden');
        return s;
    }

    hideScreen(): void {
        $(this.root, '#screen').classList.add('hidden');
    }

    showStart(): void {
        this.root.classList.add('menu');
        const s = this.screen(`
            <h1>Đế Chế Tí Hon</h1>
            <p class="sub">Chiến thuật thời gian thực</p>
            <div class="diff">${(Object.keys(AI_CONFIGS) as Difficulty[]).map(d =>
                `<button data-d="${d}" class="${d === this.difficulty ? 'on' : ''}">${AI_CONFIGS[d].label}</button>`).join('')}</div>
            <button id="start" class="primary">Bắt đầu</button>
            <button id="load" ${this.host.hasSave() ? '' : 'disabled'}>Tải trận đã lưu</button>
            <p class="help">Thắng khi phá hết công trình địch. Thua khi mất hết công trình của mình.</p>`);
        s.querySelectorAll<HTMLButtonElement>('[data-d]').forEach(b => {
            b.onclick = () => {
                this.difficulty = b.dataset.d as Difficulty;
                s.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b));
            };
        });
        $<HTMLButtonElement>(s, '#start').onclick = () => { this.root.classList.remove('menu'); this.hideScreen(); this.host.startGame(this.difficulty); };
        $<HTMLButtonElement>(s, '#load').onclick = () => {
            if (this.host.loadGame()) { this.root.classList.remove('menu'); this.hideScreen(); }
            else this.toast('Không tải được bản lưu.', 'warn');
        };
    }

    showPause(): void {
        if (!this.host.world || this.host.world.winner !== null) return;
        this.host.setPaused(true);
        const s = this.screen(`
            <h2>Tạm dừng</h2>
            <button id="resume" class="primary">Tiếp tục</button>
            <button id="save">Lưu trận</button>
            <button id="load" ${this.host.hasSave() ? '' : 'disabled'}>Tải trận đã lưu</button>
            <button id="mute">Âm thanh: bật/tắt</button>
            <button id="quit">Về màn hình chính</button>`);
        $<HTMLButtonElement>(s, '#resume').onclick = () => this.hidePause();
        $<HTMLButtonElement>(s, '#save').onclick = () => {
            this.toast(this.host.saveGame() ? 'Đã lưu trận.' : 'Lưu thất bại.', 'info');
            $<HTMLButtonElement>(s, '#load').disabled = !this.host.hasSave();
        };
        $<HTMLButtonElement>(s, '#load').onclick = () => {
            if (this.host.loadGame()) this.hidePause();
            else this.toast('Không tải được bản lưu.', 'warn');
        };
        $<HTMLButtonElement>(s, '#mute').onclick = () => this.toast(this.host.toggleMute() ? 'Đã tắt âm thanh.' : 'Đã bật âm thanh.');
        $<HTMLButtonElement>(s, '#quit').onclick = () => { this.hideScreen(); this.host.quitToMenu(); };
    }

    hidePause(): void {
        this.hideScreen();
        this.host.setPaused(false);
    }

    get screenOpen(): boolean {
        return !$(this.root, '#screen').classList.contains('hidden');
    }

    private showGameOver(winner: number): void {
        const win = winner === HUMAN;
        this.host.playSound(win ? 'victory' : 'defeat');
        const w = this.host.world!;
        const s = Math.floor(w.time);
        const el = this.screen(`
            <h2 class="${win ? 'win' : 'lose'}">${win ? 'Chiến thắng!' : 'Thất bại'}</h2>
            <p>${win ? 'Bạn đã phá huỷ toàn bộ công trình của đối thủ.' : 'Bạn đã mất toàn bộ công trình.'}</p>
            <p>Thời gian: ${Math.floor(s / 60)} phút ${s % 60} giây</p>
            <button id="again" class="primary">Về màn hình chính</button>`);
        $<HTMLButtonElement>(el, '#again').onclick = () => { this.hideScreen(); this.host.quitToMenu(); };
    }

    resetPanels(): void {
        this.buttonSig = '';
        this.infoSig = '';
        $(this.root, '#messages').innerHTML = '';
    }
}

function describeBuilding(t: keyof typeof BUILDINGS): string {
    const s = BUILDINGS[t];
    const parts: string[] = [];
    if (s.popBonus) parts.push(`+${s.popBonus} dân`);
    if (s.accepts) parts.push(`Nhận ${s.accepts.map(r => RES_NAME[r].toLowerCase()).join(', ')}`);
    if (s.trains) parts.push(`Sinh ${s.trains.map(u => UNITS[u].name).join(', ')}`);
    if (s.food) parts.push(`${s.food} thức ăn`);
    if (s.attack) parts.push('Tự bắn địch trong tầm');
    if (s.requires) parts.push(`Cần ${s.requires.map(r => BUILDINGS[r].name).join(', ')}`);
    if (s.age) parts.push(`Thời đại ${s.age}`);
    parts.push(`Máu ${s.hp} · Xây ${s.buildTime}s`);
    return parts.join(' · ');
}
