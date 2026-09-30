import Phaser from 'phaser';
import { ctxOf, SCENE_KEYS } from '../context.js';
import { numberOf } from '../state/GameState.js';
import { dayClock, formatDelta, formatMoney, levelFromXp, reputationStars } from '../systems/economy.js';
import { formatCountdown, questProgress, questTimeLeft } from '../systems/quests.js';
import { UI } from '../ui/theme.js';

export type NotifyKind = 'info' | 'reward' | 'warning';

const BAR_H = 20;
const XP_W = 56;
const XP_H = 5;
const TOAST_MS = 2600;
const TOAST_MAX = 3;
const TOAST_H = 20;
const TOAST_GAP = 3;

interface Toast {
  container: Phaser.GameObjects.Container;
  /** Box height: one line, or more when the text wrapped. */
  h: number;
  until: number;
  leaving: boolean;
  targetY: number | null;
  yTween: Phaser.Tweens.Tween | null;
}

const KIND_COLOR: Record<NotifyKind, { strip: number; text: string; glyph: string }> = {
  info: { strip: UI.infoInt, text: UI.text, glyph: 'ℹ' },
  reward: { strip: UI.coinInt, text: UI.coin, glyph: '✦' },
  warning: { strip: UI.badInt, text: UI.bad, glyph: '!' },
};

/**
 * Always running above the world: the economy bar (when `settings.economy` exists), the active quest line, floating
 * money deltas and the notification toasts. Reads `ctx.state` every frame, so it never needs to be told about changes.
 */
export class HudScene extends Phaser.Scene {
  private toasts: Toast[] = [];
  private pending: Array<{ text: string; kind: NotifyKind }> = [];
  private lastMoney: number | null = null;
  private bar!: Phaser.GameObjects.Container;
  private moneyText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private xpBack!: Phaser.GameObjects.Rectangle;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private starsText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private questBack!: Phaser.GameObjects.Rectangle;
  private questText!: Phaser.GameObjects.Text;
  private questTimer!: Phaser.GameObjects.Text;
  private lastQuestLine = '';

  constructor() {
    super(SCENE_KEYS.hud);
  }

  create(): void {
    const { width } = this.scale;
    const economy = ctxOf(this).project.settings.economy;
    this.toasts = [];
    this.lastMoney = null;
    this.lastQuestLine = '';

    const back = this.add.rectangle(0, 0, width, BAR_H, 0x0b0a12, 0.72).setOrigin(0, 0);
    const line = this.add.rectangle(0, BAR_H, width, 1, 0xf2f2f2, 0.18).setOrigin(0, 0);
    const coin = this.add.circle(11, BAR_H / 2, 4.5, UI.coinInt).setStrokeStyle(1, 0x8a5a12, 1);
    this.moneyText = this.add.text(19, BAR_H / 2, '', { fontFamily: UI.font, fontSize: '11px', fontStyle: 'bold', color: UI.coin }).setOrigin(0, 0.5);
    const midX = Math.round(width * 0.42);
    this.levelText = this.add.text(midX, BAR_H / 2, '', { fontFamily: UI.font, fontSize: '10px', fontStyle: 'bold', color: UI.text }).setOrigin(0, 0.5);
    this.xpBack = this.add.rectangle(midX + 28, BAR_H / 2, XP_W, XP_H, 0x2a2838, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x000000, 0.6);
    this.xpFill = this.add.rectangle(midX + 28, BAR_H / 2, 0, XP_H, UI.xp, 1).setOrigin(0, 0.5);
    this.starsText = this.add.text(midX + 28 + XP_W + 10, BAR_H / 2, '', { fontFamily: UI.font, fontSize: '10px', color: UI.star }).setOrigin(0, 0.5);
    this.clockText = this.add.text(width - 6, BAR_H / 2, '', { fontFamily: UI.font, fontSize: '10px', color: UI.info }).setOrigin(1, 0.5);
    this.bar = this.add.container(0, 0, [back, line, coin, this.moneyText, this.levelText, this.xpBack, this.xpFill, this.starsText, this.clockText]);
    this.bar.setVisible(!!economy);

    // The quest line sits under the bar, and under the hearts when the player has health (drawn by the world scene).
    const hasHearts = Object.values(ctxOf(this).project.scenes).some((sc) => Object.values(sc.entities).some((e) => e.components.some((c) => c.type === 'playerControl') && e.components.some((c) => c.type === 'health')));
    const qy = (economy ? BAR_H + 3 : 3) + (hasHearts ? 18 : 0);
    this.questBack = this.add.rectangle(4, qy, 10, 14, 0x0b0a12, 0.6).setOrigin(0, 0).setVisible(false);
    this.questText = this.add.text(8, qy + 7, '', { fontFamily: UI.font, fontSize: '9px', color: UI.text }).setOrigin(0, 0.5).setVisible(false);
    this.questTimer = this.add.text(0, qy + 7, '', { fontFamily: UI.font, fontSize: '9px', fontStyle: 'bold', color: UI.accent }).setOrigin(0, 0.5).setVisible(false);
  }

  /** Queues a toast. Safe to call before `create` runs; the queue drains on the first update. */
  notify(text: string, kind: NotifyKind = 'info'): void {
    this.pending.push({ text, kind });
  }

  override update(): void {
    const ctx = ctxOf(this);
    const { project, state } = ctx;
    const economy = project.settings.economy;
    const now = this.time.now;

    if (economy) {
      const money = numberOf(state, economy.moneyVariableId);
      this.moneyText.setText(formatMoney(money, economy.currencyPrefix));
      if (this.lastMoney !== null && money !== this.lastMoney) this.popMoney(money - this.lastMoney, economy.currencyPrefix);
      this.lastMoney = money;

      if (economy.xpVariableId) {
        const info = levelFromXp(numberOf(state, economy.xpVariableId), economy.levelThresholds);
        this.levelText.setText(`Lv ${info.level}`).setVisible(true);
        this.xpBack.setVisible(true);
        this.xpFill.setVisible(true).width = Math.round(XP_W * info.progress);
      } else {
        this.levelText.setVisible(false);
        this.xpBack.setVisible(false);
        this.xpFill.setVisible(false);
      }
      this.starsText.setText(economy.reputationVariableId ? reputationStars(numberOf(state, economy.reputationVariableId)) : '');
      const clock = dayClock(state.clock.elapsedMs, economy.dayLengthMs);
      this.clockText.setText(`Day ${clock.day} · ${clock.text}`);
    }

    this.updateQuestLine();
    this.updateToasts(now);
  }

  private updateQuestLine(): void {
    const { project, state } = ctxOf(this);
    const questId = Object.keys(state.activeQuests)[0];
    const quest = questId ? project.quests[questId] : undefined;
    const progress = quest ? questProgress(quest, state) : null;
    if (!quest || !progress) {
      if (this.lastQuestLine !== '') {
        this.lastQuestLine = '';
        this.questBack.setVisible(false);
        this.questText.setVisible(false);
        this.questTimer.setVisible(false);
      }
      return;
    }
    const line = `▸ ${quest.name} — ${progress.stepText} (${progress.stepIndex + 1}/${progress.count})`;
    if (line !== this.lastQuestLine) {
      this.lastQuestLine = line;
      this.questText.setText(line).setVisible(true);
      const pop = line.startsWith('▸');
      if (pop) {
        this.questText.setAlpha(0.2);
        this.tweens.add({ targets: this.questText, alpha: 1, duration: 260 });
      }
    }
    const left = questTimeLeft(quest, state, state.clock.elapsedMs);
    if (left !== null) {
      this.questTimer.setText(formatCountdown(left)).setVisible(true).setColor(left < 10_000 ? UI.bad : UI.accent);
      this.questTimer.setPosition(this.questText.x + this.questText.width + 6, this.questText.y);
    } else {
      this.questTimer.setVisible(false);
    }
    const w = this.questText.width + 8 + (left !== null ? this.questTimer.width + 6 : 0);
    this.questBack.setVisible(true).setSize(w, 14);
  }

  /** "+TSh 500" rising from the money label; deltas landing in the same frame stack. */
  private popMoney(delta: number, prefix: string): void {
    const color = delta >= 0 ? UI.good : UI.bad;
    const x = this.moneyText.x + this.moneyText.width + 8;
    const t = this.add.text(x, BAR_H / 2, formatDelta(delta, prefix), { fontFamily: UI.font, fontSize: '10px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0, 0.5).setDepth(10).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: BAR_H / 2 + 16, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, duration: 300, delay: 700, onComplete: () => t.destroy() });
  }

  private updateToasts(now: number): void {
    while (this.pending.length > 0 && this.toasts.filter((t) => !t.leaving).length < TOAST_MAX) {
      const next = this.pending.shift()!;
      this.spawnToast(next.text, next.kind, now);
    }
    // The oldest toast leaves early when more are waiting.
    const live = this.toasts.filter((t) => !t.leaving);
    for (const t of live) {
      if (now >= t.until || (this.pending.length > 0 && t === live[0] && now >= t.until - TOAST_MS * 0.6)) this.dismiss(t);
    }
    this.layoutToasts();
  }

  private toastBaseY(): number {
    const { height } = this.scale;
    const dialogueUp = this.scene.isActive(SCENE_KEYS.dialogue) ? Math.round(height * 0.34) + 6 : 0;
    return height - 10 - dialogueUp;
  }

  private spawnToast(text: string, kind: NotifyKind, now: number): void {
    const { width, height } = this.scale;
    const style = KIND_COLOR[kind];
    // With the on-screen controls up, toasts stay between the joystick and the buttons and wrap instead.
    const maxW = this.scene.isActive(SCENE_KEYS.mobile) ? Math.max(120, width - 210) : width - 24;
    const label = this.add.text(0, 0, text, { fontFamily: UI.font, fontSize: '10px', fontStyle: kind === 'reward' ? 'bold' : 'normal', color: style.text, align: 'center' }).setOrigin(0, 0.5);
    if (label.width + 30 > maxW) label.setWordWrapWidth(maxW - 30);
    const w = Math.min(maxW, label.width + 30);
    const h = Math.max(TOAST_H, label.height + 6);
    const back = this.add.rectangle(0, 0, w, h, 0x14121c, 0.92).setOrigin(0.5).setStrokeStyle(1, style.strip, 0.9);
    const strip = this.add.rectangle(-w / 2, 0, 3, h, style.strip, 1).setOrigin(0, 0.5);
    const glyph = this.add.text(-w / 2 + 10, 0, style.glyph, { fontFamily: UI.font, fontSize: '10px', fontStyle: 'bold', color: style.text }).setOrigin(0.5);
    label.setPosition(-w / 2 + 19, 0);
    const container = this.add.container(width / 2, height + h, [back, strip, glyph, label]).setAlpha(0).setDepth(20);
    const toast: Toast = { container, h, until: now + TOAST_MS, leaving: false, targetY: null, yTween: null };
    this.toasts.push(toast);
    if (kind === 'reward') {
      // A coin-coloured sparkle punch so rewards feel like rewards.
      container.setScale(0.85);
      this.tweens.add({ targets: container, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    this.tweens.add({ targets: container, alpha: 1, duration: 180 });
  }

  private dismiss(t: Toast): void {
    t.leaving = true;
    t.yTween?.stop();
    this.tweens.add({
      targets: t.container, alpha: 0, y: t.container.y + 8, duration: 220, ease: 'Quad.easeIn',
      onComplete: () => { t.container.destroy(); this.toasts = this.toasts.filter((x) => x !== t); },
    });
  }

  /** Newest at the bottom; the others slide up to make room. */
  private layoutToasts(): void {
    const base = this.toastBaseY();
    const live = this.toasts.filter((t) => !t.leaving);
    let bottom = base;
    for (let i = live.length - 1; i >= 0; i--) {
      const t = live[i]!;
      const y = bottom - t.h / 2;
      bottom -= t.h + TOAST_GAP;
      if (t.targetY === y) continue;
      t.targetY = y;
      t.yTween?.stop();
      t.yTween = this.tweens.add({ targets: t.container, y, duration: 240, ease: 'Back.easeOut' });
    }
  }
}
