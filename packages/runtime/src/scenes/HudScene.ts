import Phaser from 'phaser';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { numberOf } from '../state/GameState.js';
import { clockHour, atmosphereAt } from '../systems/atmosphere.js';
import { dayClock, formatDelta, formatMoney, levelFromXp } from '../systems/economy.js';
import { formatCountdown, questProgress, questTimeLeft } from '../systems/quests.js';
import { drawPanel, keycap, TEXT, UI } from '../ui/theme.js';
import type { WorldScene } from './WorldScene.js';
import { AudioSystem } from '../audio/AudioSystem.js';

export type NotifyKind = 'info' | 'reward' | 'warning';
export type CardKind = 'mission' | 'complete' | 'failed' | 'location' | 'level';

const TOAST_MS = 2800;
const TOAST_MAX = 3;
const TOAST_GAP = 6;
const CARD_MS = 2200;
const HEART_W = 26;

interface Toast {
  container: Phaser.GameObjects.Container;
  h: number;
  until: number;
  leaving: boolean;
  targetY: number | null;
  yTween: Phaser.Tweens.Tween | null;
}

const KIND: Record<NotifyKind, { strip: number; text: string; glyph: string }> = {
  info: { strip: UI.infoInt, text: UI.text, glyph: 'i' },
  reward: { strip: UI.coinInt, text: UI.coin, glyph: '✦' },
  warning: { strip: UI.badInt, text: UI.bad, glyph: '!' },
};
const CARD: Record<CardKind, { label: string; color: string; colorInt: number; size: number }> = {
  mission: { label: 'NEW MISSION', color: UI.accent, colorInt: UI.accentInt, size: 56 },
  complete: { label: 'MISSION COMPLETE', color: UI.good, colorInt: UI.goodInt, size: 56 },
  failed: { label: 'MISSION FAILED', color: UI.bad, colorInt: UI.badInt, size: 52 },
  location: { label: 'DISCOVERED', color: UI.info, colorInt: UI.infoInt, size: 42 },
  level: { label: 'LEVEL UP', color: '#9be0ff', colorInt: UI.xp, size: 64 },
};

/**
 * Always running above the world. Top-left: the player's portrait, hearts, money, level with XP bar and reputation.
 * Top-right: the day clock with a sun or moon. Bottom-left: the active mission with its timer. Bottom-centre: toasts.
 * Centre: letterboxed cards for missions, discoveries and level-ups. Reads `ctx.state` and the world scene every
 * frame, so it never needs to be told about changes except for toasts and cards.
 */
export class HudScene extends Phaser.Scene {
  private toasts: Toast[] = [];
  private pending: Array<{ text: string; kind: NotifyKind }> = [];
  private cards: Array<{ kind: CardKind; title: string; subtitle: string }> = [];
  private cardBusy = false;
  private lastMoney: number | null = null;
  private lastLevel: number | null = null;
  private lastHearts = -1;
  private lastMax = -1;
  private lastQuestKey = '';

  private statusBox!: Phaser.GameObjects.Graphics;
  private portrait: Phaser.GameObjects.Image | null = null;
  private hearts: Phaser.GameObjects.Image[] = [];
  private heartsX = 0;
  private moneyText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private xpBack!: Phaser.GameObjects.Rectangle;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private xpW = 120;
  private starsText!: Phaser.GameObjects.Text;
  private clockBox!: Phaser.GameObjects.Graphics;
  private clockIcon!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  private abilityChip!: Phaser.GameObjects.Container;
  private abilityWipe!: Phaser.GameObjects.Graphics;
  private questBox!: Phaser.GameObjects.Graphics;
  private questLabel!: Phaser.GameObjects.Text;
  private questName!: Phaser.GameObjects.Text;
  private questStep!: Phaser.GameObjects.Text;
  private questTimer!: Phaser.GameObjects.Text;
  private questBar!: Phaser.GameObjects.Rectangle;
  private questBarBack!: Phaser.GameObjects.Rectangle;
  private questGroup!: Phaser.GameObjects.Container;

  constructor() {
    super(SCENE_KEYS.hud);
  }

  create(): void {
    const { width, height } = this.scale;
    const { project } = ctxOf(this);
    const economy = project.settings.economy;
    this.toasts = [];
    this.cards = [];
    this.cardBusy = false;
    this.lastMoney = null;
    this.lastLevel = null;
    this.lastHearts = -1;
    this.lastMax = -1;
    this.lastQuestKey = '';
    this.hearts = [];
    this.ensureTextures();

    // --- Status panel (top-left).
    this.statusBox = this.add.graphics().setDepth(1);
    const player = this.playerEntity();
    const portraitId = player?.character?.portraitAssetId;
    let x = 14;
    if (portraitId && this.textures.exists(KEYS.image(portraitId))) {
      this.portrait = this.add.image(x + 27, 14 + 27, KEYS.image(portraitId)).setDisplaySize(50, 50).setDepth(3);
      const frame = this.add.graphics().setDepth(2);
      frame.fillStyle(0x000000, 0.5); frame.fillRoundedRect(x - 1, 13, 56, 56, 10);
      frame.lineStyle(2, UI.accentInt, 0.9); frame.strokeRoundedRect(x - 1, 13, 56, 56, 10);
      const mask = this.make.graphics({ x: 0, y: 0 }, false);
      mask.fillRoundedRect(x + 2, 16, 50, 50, 8);
      this.portrait.setMask(mask.createGeometryMask());
      x += 66;
    }
    this.heartsX = x;
    this.coinIcon = this.add.graphics().setDepth(3);
    this.moneyText = this.add.text(0, 0, '', { ...TEXT.bold, fontSize: '20px', color: UI.coin }).setOrigin(0, 0.5).setDepth(3);
    this.levelText = this.add.text(0, 0, '', { ...TEXT.bold, fontSize: '15px', color: UI.text }).setOrigin(0, 0.5).setDepth(3);
    this.xpBack = this.add.rectangle(0, 0, this.xpW, 8, 0x0a0b14, 0.9).setOrigin(0, 0.5).setStrokeStyle(1, 0xffffff, 0.15).setDepth(3);
    this.xpFill = this.add.rectangle(0, 0, 0, 6, UI.xp, 1).setOrigin(0, 0.5).setDepth(4);
    this.starsText = this.add.text(0, 0, '', { ...TEXT.bold, fontSize: '15px', color: UI.star }).setOrigin(0, 0.5).setDepth(3);
    const showEconomy = !!economy;
    this.coinIcon.setVisible(showEconomy); this.moneyText.setVisible(showEconomy);

    // --- Ability chip under the status panel.
    this.abilityWipe = this.add.graphics();
    const cap = keycap(this, 0, 0, project.settings.abilityKey ?? 'X', 22);
    const ring = this.add.graphics();
    ring.lineStyle(2, 0xffffff, 0.25); ring.strokeCircle(0, 0, 19);
    this.abilityChip = this.add.container(0, 0, [ring, this.abilityWipe, cap]).setDepth(3).setVisible(false);

    // --- Clock pill (top-right).
    this.clockBox = this.add.graphics().setDepth(1);
    this.clockIcon = this.add.graphics().setDepth(3);
    this.clockText = this.add.text(width - 22, 32, '', { ...TEXT.bold, fontSize: '16px', color: UI.info }).setOrigin(1, 0.5).setDepth(3);

    // --- Mission panel (bottom-left).
    this.questBox = this.add.graphics();
    this.questLabel = this.add.text(0, 0, 'MISSION', { ...TEXT.label, fontSize: '12px', letterSpacing: 2, color: UI.accent });
    this.questName = this.add.text(0, 0, '', { ...TEXT.bold, fontSize: '18px' });
    this.questStep = this.add.text(0, 0, '', { ...TEXT.small, color: UI.muted });
    this.questTimer = this.add.text(0, 0, '', { ...TEXT.display(22, UI.accent) }).setOrigin(1, 0);
    this.questBarBack = this.add.rectangle(0, 0, 100, 5, 0x0a0b14, 0.9).setOrigin(0, 0.5);
    this.questBar = this.add.rectangle(0, 0, 100, 5, UI.accentInt, 1).setOrigin(0, 0.5);
    this.questGroup = this.add.container(0, 0, [this.questBox, this.questLabel, this.questName, this.questStep, this.questTimer, this.questBarBack, this.questBar]).setDepth(2).setVisible(false);
    void height;
  }

  /** Queues a toast. Safe to call before `create` runs; the queue drains on the first update. */
  notify(text: string, kind: NotifyKind = 'info'): void {
    this.pending.push({ text, kind });
  }

  /** Queues a centred letterboxed card (mission started or complete, a discovered place, a level up). */
  card(kind: CardKind, title: string, subtitle = ''): void {
    this.cards.push({ kind, title, subtitle });
  }

  private gameOverObjects: Phaser.GameObjects.GameObject[] = [];

  /** The defeat card: a shade, the title in the display face and the retry key. */
  showGameOver(attackKey: string): void {
    this.hideGameOver();
    const { width, height } = this.scale;
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x05060c, 0.55).setDepth(40).setAlpha(0);
    const title = this.add.text(width / 2, height / 2 - 10, 'DOWN FOR THE COUNT', { ...TEXT.display(58, UI.bad), stroke: '#0a0a14', strokeThickness: 8 }).setOrigin(0.5).setDepth(41).setAlpha(0).setScale(1.3);
    const cap = keycap(this, width / 2 - 60, height / 2 + 44, attackKey, 24).setDepth(41).setAlpha(0);
    const hint = this.add.text(width / 2 - 36, height / 2 + 44, 'to get back up', { ...TEXT.body, fontSize: '18px', color: UI.muted }).setOrigin(0, 0.5).setDepth(41).setAlpha(0);
    this.gameOverObjects = [shade, title, cap, hint];
    this.tweens.add({ targets: shade, alpha: 1, duration: 600, delay: 300, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 420, delay: 700, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [cap, hint], alpha: 1, duration: 300, delay: 1100 });
  }

  hideGameOver(): void {
    for (const o of this.gameOverObjects) o.destroy();
    this.gameOverObjects = [];
  }

  override update(): void {
    const ctx = ctxOf(this);
    const { project, state } = ctx;
    const economy = project.settings.economy;
    const now = this.time.now;
    const world = this.scene.get(SCENE_KEYS.world) as WorldScene | null;
    const worldLive = !!world && this.scene.isActive(SCENE_KEYS.world);

    // Hearts
    const health = worldLive ? world.playerHealth() : null;
    this.layoutHearts(health);

    // Money, level, stars
    let rowY = 14 + 27 + 10;
    const left = this.heartsX;
    if (economy) {
      const money = numberOf(state, economy.moneyVariableId);
      this.moneyText.setText(formatMoney(money, economy.currencyPrefix)).setPosition(left + 20, rowY);
      this.coinIcon.clear();
      this.coinIcon.fillStyle(0x8a5a12, 1); this.coinIcon.fillCircle(left + 8, rowY + 1, 8);
      this.coinIcon.fillStyle(UI.coinInt, 1); this.coinIcon.fillCircle(left + 8, rowY, 8);
      this.coinIcon.fillStyle(0xfff1b8, 1); this.coinIcon.fillCircle(left + 5.5, rowY - 2.5, 2.5);
      if (this.lastMoney !== null && money !== this.lastMoney) this.popMoney(money - this.lastMoney, economy.currencyPrefix, this.moneyText.x + this.moneyText.width + 10, rowY);
      this.lastMoney = money;
      let lx = this.moneyText.x + this.moneyText.width + 18;
      if (economy.xpVariableId) {
        const info = levelFromXp(numberOf(state, economy.xpVariableId), economy.levelThresholds);
        if (this.lastLevel !== null && info.level > this.lastLevel) this.card('level', `LEVEL ${info.level}`, 'Keep it up.');
        this.lastLevel = info.level;
        this.levelText.setText(`LV ${info.level}`).setPosition(lx, rowY).setVisible(true);
        lx += this.levelText.width + 8;
        this.xpBack.setPosition(lx, rowY).setVisible(true);
        this.xpFill.setPosition(lx + 1, rowY).setVisible(true).width = Math.round((this.xpW - 2) * info.progress);
        lx += this.xpW + 10;
      } else {
        this.levelText.setVisible(false); this.xpBack.setVisible(false); this.xpFill.setVisible(false);
      }
      if (economy.reputationVariableId) {
        const rep = Math.max(0, Math.min(5, Math.round(numberOf(state, economy.reputationVariableId))));
        this.starsText.setText('★'.repeat(rep) + '☆'.repeat(5 - rep)).setPosition(lx, rowY).setVisible(true);
        lx += this.starsText.width;
      } else this.starsText.setVisible(false);
      this.drawStatusBox(Math.max(lx, this.heartsX + Math.max(health?.max ?? 0, 1) * HEART_W) + 14, this.portrait ? 70 : 62);
    } else {
      this.drawStatusBox(this.heartsX + Math.max(health?.max ?? 0, 1) * HEART_W + 14, this.portrait ? 70 : (health ? 46 : 0));
    }

    // Ability chip
    const ability = worldLive ? world.abilityStatus() : null;
    if (ability) {
      this.abilityChip.setVisible(true).setPosition(this.heartsX - (this.portrait ? 66 : 0) + 24, (this.portrait ? 70 : 62) + 14 + 22);
      this.abilityWipe.clear();
      if (ability.total > 0 && ability.left > 0) {
        this.abilityWipe.fillStyle(0x000000, 0.55);
        this.abilityWipe.slice(0, 0, 19, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * (ability.left / ability.total)), false);
        this.abilityWipe.fillPath();
      }
    } else this.abilityChip.setVisible(false);

    // Clock
    const hour = clockHour(project, state.clock.elapsedMs);
    if (hour !== null) {
      const len = economy?.dayLengthMs ?? project.settings.presentation?.dayLengthMs ?? 120_000;
      const clock = dayClock(state.clock.elapsedMs, len, project.settings.presentation?.startHour);
      this.clockText.setText(`Day ${clock.day} · ${clock.text}`).setVisible(true);
      const night = atmosphereAt(hour).night;
      const w = this.clockText.width + 56;
      const { width } = this.scale;
      this.clockBox.clear();
      drawPanel(this.clockBox, width - 14 - w, 14, w, 36, { radius: 18, alpha: 0.82 });
      const ix = width - 14 - w + 20; const iy = 32;
      this.clockIcon.clear();
      if (night > 0.5) {
        this.clockIcon.fillStyle(0xfff6dc, 1); this.clockIcon.fillCircle(ix, iy, 8);
        this.clockIcon.fillStyle(UI.panel, 1); this.clockIcon.fillCircle(ix + 4, iy - 2, 7);
      } else {
        this.clockIcon.fillStyle(UI.accentInt, 0.35); this.clockIcon.fillCircle(ix, iy, 11);
        this.clockIcon.fillStyle(0xffe08a, 1); this.clockIcon.fillCircle(ix, iy, 7);
      }
      this.clockBox.setVisible(true); this.clockIcon.setVisible(true);
    } else {
      this.clockText.setVisible(false); this.clockBox.setVisible(false); this.clockIcon.setVisible(false);
    }

    this.updateQuest();
    this.updateToasts(now);
    this.updateCards();
  }

  // ------------------------------------------------------------------ pieces

  private playerEntity(): { character: { portraitAssetId?: string } | null } | null {
    const { project } = ctxOf(this);
    for (const scene of Object.values(project.scenes)) {
      for (const e of Object.values(scene.entities)) {
        if (!e.components.some((c) => c.type === 'playerControl')) continue;
        const sprite = e.components.find((c) => c.type === 'sprite');
        const character = sprite && sprite.type === 'sprite' ? project.characters[sprite.characterId] : undefined;
        return { character: character ? { ...(character.portraitAssetId ? { portraitAssetId: character.portraitAssetId } : {}) } : null };
      }
    }
    return null;
  }

  private ensureTextures(): void {
    const heart = (key: string, fill: number, alpha: number) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const draw = (col: number, a: number, dx: number, dy: number, r: number) => {
        g.fillStyle(col, a);
        g.fillCircle(7 + dx, 7 + dy, r); g.fillCircle(15 + dx, 7 + dy, r);
        g.fillTriangle(1.2 + dx, 9 + dy, 20.8 + dx, 9 + dy, 11 + dx, 20 + dy);
      };
      draw(0x000000, 0.45, 1, 2, 5.4);
      draw(fill, alpha, 0, 0, 5.4);
      if (alpha === 1) { g.fillStyle(0xffffff, 0.55); g.fillCircle(5.5, 5, 1.8); }
      g.generateTexture(key, 24, 24);
      g.destroy();
    };
    heart('ui:heart', UI.heart, 1);
    heart('ui:heart_empty', UI.heartDeep, 0.8);
  }

  private layoutHearts(health: { current: number; max: number } | null): void {
    if (!health) {
      for (const h of this.hearts) h.setVisible(false);
      return;
    }
    const y = 14 + 16;
    if (health.max !== this.lastMax) {
      for (const h of this.hearts) h.destroy();
      this.hearts = [];
      for (let i = 0; i < health.max; i++) this.hearts.push(this.add.image(this.heartsX + 12 + i * HEART_W, y, 'ui:heart').setDepth(3));
      this.lastMax = health.max;
      this.lastHearts = health.current;
    }
    if (health.current !== this.lastHearts) {
      const lost = health.current < this.lastHearts;
      this.hearts.forEach((h, i) => {
        const full = i < health.current;
        const was = i < this.lastHearts;
        if (full !== was) {
          h.setTexture(full ? 'ui:heart' : 'ui:heart_empty');
          if (lost) {
            h.setScale(1.5).setAngle(-12);
            this.tweens.add({ targets: h, scale: 1, angle: 0, duration: 380, ease: 'Bounce.easeOut' });
          } else {
            h.setScale(0.4);
            this.tweens.add({ targets: h, scale: 1, duration: 320, ease: 'Back.easeOut' });
          }
        }
      });
      if (lost) this.tweens.add({ targets: this.hearts, x: '+=3', duration: 40, yoyo: true, repeat: 3 });
      this.lastHearts = health.current;
    }
    this.hearts.forEach((h) => h.setVisible(true));
  }

  private drawStatusBox(w: number, h: number): void {
    this.statusBox.clear();
    if (h <= 0) return;
    drawPanel(this.statusBox, 8, 8, w - 8 + 6, h, { radius: 14, alpha: 0.8 });
  }

  private updateQuest(): void {
    const { project, state } = ctxOf(this);
    const questId = Object.keys(state.activeQuests)[0];
    const quest = questId ? project.quests[questId] : undefined;
    const progress = quest ? questProgress(quest, state) : null;
    if (!quest || !progress) {
      if (this.questGroup.visible) this.questGroup.setVisible(false);
      this.lastQuestKey = '';
      return;
    }
    const left = questTimeLeft(quest, state, state.clock.elapsedMs);
    const key = `${quest.id}:${progress.stepIndex}`;
    const w = 340;
    const x = this.abilityChip.visible ? 58 : 12;
    const y = (this.portrait ? 70 : 62) + 16;
    if (key !== this.lastQuestKey) {
      this.lastQuestKey = key;
      this.questName.setText(quest.name);
      this.questStep.setText(`${progress.stepText}  ·  ${progress.stepIndex + 1}/${progress.count}`).setWordWrapWidth(w - (left !== null ? 120 : 30));
      this.questGroup.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.questGroup, alpha: 1, duration: 260 });
    }
    const h = 50 + this.questStep.height;
    this.questGroup.setPosition(x, y);
    this.questBox.clear();
    drawPanel(this.questBox, 0, 0, w, h, { radius: 12, alpha: 0.82 });
    this.questBox.fillStyle(UI.accentInt, 1); this.questBox.fillRoundedRect(0, 10, 4, h - 20, 2);
    this.questLabel.setPosition(14, 8);
    this.questName.setPosition(14, 22);
    this.questStep.setPosition(14, 44);
    if (left !== null) {
      const total = quest.timeLimitMs ?? 1;
      const urgent = left < 10_000;
      this.questTimer.setText(formatCountdown(left)).setPosition(w - 12, 8).setVisible(true).setColor(urgent ? UI.bad : UI.accent);
      this.questBarBack.setPosition(w - 12 - 90, 38).setSize(90, 5).setVisible(true);
      this.questBar.setPosition(w - 12 - 90, 38).setSize(Math.max(0, 90 * (left / total)), 5).setVisible(true).setFillStyle(urgent ? UI.badInt : UI.accentInt);
    } else {
      this.questTimer.setVisible(false); this.questBar.setVisible(false); this.questBarBack.setVisible(false);
    }
  }

  /** "+TSh 500" rising from the money label. */
  private popMoney(delta: number, prefix: string, x: number, y: number): void {
    const color = delta >= 0 ? UI.good : UI.bad;
    const t = this.add.text(x, y, formatDelta(delta, prefix), { ...TEXT.display(22, color), stroke: '#000000', strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(10).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y + 26, duration: 900, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, duration: 300, delay: 700, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------------ toasts

  private updateToasts(now: number): void {
    while (this.pending.length > 0 && this.toasts.filter((t) => !t.leaving).length < TOAST_MAX) {
      const next = this.pending.shift()!;
      this.spawnToast(next.text, next.kind, now);
    }
    const live = this.toasts.filter((t) => !t.leaving);
    for (const t of live) {
      if (now >= t.until || (this.pending.length > 0 && t === live[0] && now >= t.until - TOAST_MS * 0.6)) this.dismiss(t);
    }
    this.layoutToasts();
  }

  private toastBaseY(): number {
    const { height } = this.scale;
    const dialogueUp = this.scene.isActive(SCENE_KEYS.dialogue) ? Math.round(height * 0.36) + 12 : 0;
    return height - 18 - dialogueUp;
  }

  private spawnToast(text: string, kind: NotifyKind, now: number): void {
    const { width, height } = this.scale;
    const style = KIND[kind];
    const maxW = this.scene.isActive(SCENE_KEYS.mobile) ? Math.max(260, width - 420) : Math.min(640, width - 48);
    const label = this.add.text(0, 0, text, { ...TEXT.body, fontSize: '17px', fontStyle: kind === 'reward' ? '800' : '600', color: style.text, align: 'left' }).setOrigin(0, 0.5);
    if (label.width + 62 > maxW) label.setWordWrapWidth(maxW - 62);
    const w = Math.min(maxW, label.width + 62);
    const h = Math.max(40, label.height + 14);
    const g = this.add.graphics();
    drawPanel(g, -w / 2, -h / 2, w, h, { radius: 10, alpha: 0.94 });
    g.fillStyle(style.strip, 1); g.fillRoundedRect(-w / 2, -h / 2, 5, h, { tl: 10, bl: 10, tr: 0, br: 0 });
    g.fillStyle(style.strip, 0.18); g.fillCircle(-w / 2 + 26, 0, 12);
    const glyph = this.add.text(-w / 2 + 26, 0, style.glyph, { ...TEXT.bold, fontSize: '15px', color: style.text }).setOrigin(0.5);
    label.setPosition(-w / 2 + 46, 0);
    const container = this.add.container(width / 2, height + h, [g, glyph, label]).setAlpha(0).setDepth(20);
    const toast: Toast = { container, h, until: now + TOAST_MS, leaving: false, targetY: null, yTween: null };
    this.toasts.push(toast);
    if (kind === 'reward') {
      container.setScale(0.85);
      this.tweens.add({ targets: container, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    this.tweens.add({ targets: container, alpha: 1, duration: 180 });
  }

  private dismiss(t: Toast): void {
    t.leaving = true;
    t.yTween?.stop();
    this.tweens.add({
      targets: t.container, alpha: 0, y: t.container.y + 10, duration: 220, ease: 'Quad.easeIn',
      onComplete: () => { t.container.destroy(); this.toasts = this.toasts.filter((x) => x !== t); },
    });
  }

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

  // ------------------------------------------------------------------ cards

  private updateCards(): void {
    if (this.cardBusy || this.cards.length === 0) return;
    const next = this.cards.shift()!;
    this.cardBusy = true;
    AudioSystem.of(this)?.sfx(next.kind === 'mission' ? 'quest_start' : next.kind === 'complete' ? 'quest_done' : next.kind === 'failed' ? 'quest_fail' : next.kind === 'level' ? 'level_up' : 'discover');
    const { width, height } = this.scale;
    const c = CARD[next.kind];
    const big = next.kind !== 'location';
    const barH = big ? 46 : 0;
    const top = this.add.rectangle(0, -barH, width, barH, 0x000000, 0.85).setOrigin(0, 0).setDepth(30);
    const bottom = this.add.rectangle(0, height, width, barH, 0x000000, 0.85).setOrigin(0, 0).setDepth(30);
    const cy = big ? height / 2 : height * 0.2;
    const label = this.add.text(width / 2, cy - c.size * 0.62, c.label, { ...TEXT.label, fontSize: '15px', letterSpacing: 4, color: c.color }).setOrigin(0.5).setDepth(31).setAlpha(0);
    const title = this.add.text(width / 2, cy, next.title, { ...TEXT.display(c.size, UI.text), stroke: '#0a0a14', strokeThickness: 8 }).setOrigin(0.5).setDepth(31).setAlpha(0);
    const line = this.add.rectangle(width / 2, cy + c.size * 0.55, 0, 3, c.colorInt, 1).setOrigin(0.5).setDepth(31);
    const sub = this.add.text(width / 2, cy + c.size * 0.55 + 20, next.subtitle, { ...TEXT.body, fontSize: '18px', color: UI.muted }).setOrigin(0.5).setDepth(31).setAlpha(0);
    const shade = this.add.rectangle(width / 2, cy, width, c.size * 2.4, 0x000000, big ? 0.35 : 0.25).setDepth(30).setAlpha(0);
    const all = [top, bottom, label, title, line, sub, shade];

    this.tweens.add({ targets: top, y: 0, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: bottom, y: height - barH, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: shade, alpha: 1, duration: 200 });
    title.setScale(1.25).setX(width / 2 - 30);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, x: width / 2, duration: 320, delay: 120, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: label, alpha: 1, y: label.y + 4, duration: 260, delay: 80 });
    this.tweens.add({ targets: line, width: Math.min(width * 0.5, title.width * 0.8), duration: 420, delay: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 380 });
    this.time.delayedCall(CARD_MS, () => {
      this.tweens.add({ targets: top, y: -barH, duration: 260, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: bottom, y: height, duration: 260, ease: 'Cubic.easeIn' });
      this.tweens.add({ targets: [label, title, line, sub, shade], alpha: 0, duration: 240, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: title, x: width / 2 + 30, duration: 240, ease: 'Quad.easeIn', onComplete: () => { all.forEach((o) => o.destroy()); this.cardBusy = false; } });
    });
  }
}
