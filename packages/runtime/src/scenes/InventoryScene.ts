import type Phaser from 'phaser';
import { ctxOf, SCENE_KEYS } from '../context.js';
import { numberOf } from '../state/GameState.js';
import { formatMoney, ownedProperties } from '../systems/economy.js';
import { formatCountdown, questProgress, questTimeLeft } from '../systems/quests.js';
import { DEPTH, TEXT, UI } from '../ui/theme.js';
import { OverlayScene, type OverlayButton } from './OverlayScene.js';

const TABS = ['Items', 'Stats', 'Properties', 'Missions'] as const;
const ROW_H = 14;

/** I: items, stats, owned properties and quests in tabs. Left/Right switch tabs; I or Esc closes. */
export class InventoryScene extends OverlayScene {
  private tab = 0;
  private panel!: Phaser.Geom.Rectangle;
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private content: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SCENE_KEYS.inventory);
  }

  init(): void {
    this.tab = 0;
    this.tabTexts = [];
    this.content = [];
  }

  create(): void {
    const { width, height } = this.scale;
    this.panel = this.setupOverlay(Math.min(340, width - 16), height - 12);
    this.title(this.panel, 'Inventory');
    this.hint(this.panel, 'Left/Right switch tab · I or Esc close');
    let x = this.panel.x + 12;
    const y = this.panel.y + 30;
    TABS.forEach((name) => {
      const t = this.add.text(x, y, name, TEXT.bold).setDepth(DEPTH.content);
      this.tabTexts.push(t);
      x += t.width + 14;
    });
    this.add.rectangle(this.panel.x + 12, y + 15, this.panel.width - 24, 1, UI.accentInt, 0.35).setOrigin(0, 0).setDepth(DEPTH.content);
    this.render();
  }

  private render(): void {
    const { project, state } = ctxOf(this);
    const economy = project.settings.economy;
    const money = (n: number) => (economy ? formatMoney(n, economy.currencyPrefix) : String(n));
    this.tabTexts.forEach((t, i) => t.setColor(i === this.tab ? UI.accent : UI.muted));
    for (const o of this.content) o.destroy();
    this.content = [];
    const x = this.panel.x + 14;
    const right = this.panel.right - 14;
    let y = this.panel.y + 52;
    const maxY = this.panel.bottom - 26;
    const row = (left: string, rightText = '', color: string = UI.text): void => {
      if (y + ROW_H > maxY) return;
      this.content.push(this.add.text(x, y, left, { ...TEXT.body, color }).setDepth(DEPTH.content));
      if (rightText) this.content.push(this.add.text(right, y, rightText, { ...TEXT.body, color: UI.coin }).setOrigin(1, 0).setDepth(DEPTH.content));
      y += ROW_H;
    };
    const empty = (text: string) => { this.content.push(this.add.text(x, y, text, { ...TEXT.body, color: UI.muted }).setDepth(DEPTH.content)); };
    const vars = Object.values(project.variables);

    switch (TABS[this.tab]) {
      case 'Items': {
        const items = vars.filter((v) => v.category === 'item' && numberOf(state, v.id) > 0);
        if (items.length === 0) empty('Nothing carried yet.');
        for (const v of items) row(`${v.label ?? v.name}`, `×${numberOf(state, v.id)}`);
        break;
      }
      case 'Stats': {
        const stats = vars.filter((v) => v.category === 'stat');
        if (stats.length === 0) empty('No stats to show.');
        for (const v of stats) {
          const val = state.variables[v.id];
          const shown = economy && v.id === economy.moneyVariableId && typeof val === 'number' ? money(val) : String(val ?? '');
          row(v.label ?? v.name, shown);
        }
        break;
      }
      case 'Properties': {
        const owned = ownedProperties(project, state);
        if (owned.length === 0) empty('You own no property yet. Look for the gold signs.');
        for (const p of owned) row(p.name, `+${money(p.incomePerDay)}/day`);
        if (owned.length > 0) row(`Total income`, `+${money(owned.reduce((s, p) => s + p.incomePerDay, 0))}/day`, UI.muted);
        break;
      }
      case 'Missions': {
        const active = Object.keys(state.activeQuests).map((id) => project.quests[id]).filter((q) => !!q);
        const done = state.completedQuests.map((id) => project.quests[id]).filter((q) => !!q);
        if (active.length === 0 && done.length === 0) empty('No missions yet. Talk to people around town.');
        for (const q of active) {
          const p = questProgress(q, state);
          const left = questTimeLeft(q, state, state.clock.elapsedMs);
          row(`▸ ${q.name}`, left !== null ? formatCountdown(left) : '', UI.accent);
          if (p) row(`   ${p.stepText} (${p.stepIndex + 1}/${p.count})`, '', UI.text);
        }
        for (const q of done) row(`✓ ${q.name}`, '', UI.muted);
        break;
      }
    }
  }

  protected onButton(b: OverlayButton): void {
    switch (b) {
      case 'left': this.tab = (this.tab + TABS.length - 1) % TABS.length; this.render(); break;
      case 'right': this.tab = (this.tab + 1) % TABS.length; this.render(); break;
      case 'cancel':
      case 'inventory': this.close(); break;
      default: break;
    }
  }
}
