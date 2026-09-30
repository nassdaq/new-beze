import Phaser from 'phaser';
import { ctxOf, SCENE_KEYS } from '../context.js';
import { numberOf } from '../state/GameState.js';
import { buyItem, formatMoney, sellItem, variableLabel } from '../systems/economy.js';
import { DEPTH, TEXT, UI } from '../ui/theme.js';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { OverlayScene, type OverlayButton } from './OverlayScene.js';
import { AudioSystem } from '../audio/AudioSystem.js';

export interface ShopInit {
  shop: NonNullable<SpawnedEntity['shop']>;
}

type Row = { kind: 'buy' | 'sell'; variableId: string; price: number };

const ROW_H = 32;
const MAX_VISIBLE = 8;

/** Buy/sell list over item variables. Up/Down select, E or Enter trades one unit, Esc or Q closes. */
export class ShopScene extends OverlayScene {
  private shop!: ShopInit['shop'];
  private rows: Row[] = [];
  private selected = 0;
  private scroll = 0;
  private panel!: Phaser.Geom.Rectangle;
  private moneyText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private list: Phaser.GameObjects.GameObject[] = [];
  private bar!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE_KEYS.shop);
  }

  init(data: ShopInit): void {
    this.shop = data.shop;
    this.rows = [
      ...data.shop.sells.map((s): Row => ({ kind: 'buy', variableId: s.variableId, price: s.price })),
      ...data.shop.buys.map((s): Row => ({ kind: 'sell', variableId: s.variableId, price: s.price })),
    ];
    this.selected = 0;
    this.scroll = 0;
    this.list = [];
  }

  create(): void {
    const { width, height } = this.scale;
    const panelW = Math.min(600, width - 40);
    const panelH = Math.min(height - 32, 120 + Math.min(this.rows.length + 2, MAX_VISIBLE + 2) * ROW_H + 52);
    this.panel = this.setupOverlay(panelW, panelH);
    this.title(this.panel, this.shop.name);
    this.moneyText = this.add.text(this.panel.right - 24, this.panel.y + 28, '', { ...TEXT.bold, fontSize: '20px', color: UI.coin }).setOrigin(1, 0.5).setDepth(DEPTH.content);
    this.status = this.add.text(this.panel.x + 24, this.panel.bottom - 44, '', { ...TEXT.small, color: UI.muted }).setDepth(DEPTH.content);
    this.bar = this.add.graphics().setDepth(DEPTH.content);
    this.hint(this.panel, 'Up / Down choose  ·  E buy or sell one  ·  Esc close');
    this.render();
  }

  private render(): void {
    const { project, state } = ctxOf(this);
    const economy = project.settings.economy;
    for (const o of this.list) o.destroy();
    this.list = [];
    this.bar.clear();
    this.moneyText.setText(economy ? formatMoney(numberOf(state, economy.moneyVariableId), economy.currencyPrefix) : '');

    const x = this.panel.x + 24;
    const right = this.panel.right - 24;
    let y = this.panel.y + 64;
    const add = (o: Phaser.GameObjects.GameObject) => { this.list.push(o); (o as unknown as { setDepth(d: number): void }).setDepth(DEPTH.top); };
    const header = (text: string) => {
      add(this.add.text(x, y + 8, text, { ...TEXT.label, letterSpacing: 2, color: UI.accent }));
      y += ROW_H;
    };

    if (this.selected < this.scroll) this.scroll = this.selected;
    if (this.selected >= this.scroll + MAX_VISIBLE) this.scroll = this.selected - MAX_VISIBLE + 1;
    const visible = this.rows.slice(this.scroll, this.scroll + MAX_VISIBLE);
    let lastKind: Row['kind'] | null = null;
    if (this.rows.length === 0) add(this.add.text(x, y, 'Nothing for sale today.', TEXT.body));
    visible.forEach((row, i) => {
      const index = this.scroll + i;
      if (row.kind !== lastKind) { header(row.kind === 'buy' ? 'BUY' : 'SELL'); lastKind = row.kind; }
      const active = index === this.selected;
      const have = numberOf(state, row.variableId);
      if (active) this.rowBar(this.bar, x - 10, y - 2, right - x + 20, ROW_H - 2);
      add(this.add.text(x + 8, y + ROW_H / 2 - 1, variableLabel(project, row.variableId), { ...TEXT.body, fontSize: '18px', color: active ? UI.accent : UI.text, fontStyle: active ? '800' : '600' }).setOrigin(0, 0.5));
      add(this.add.text(right - 110, y + ROW_H / 2 - 1, `×${have}`, { ...TEXT.body, color: UI.muted }).setOrigin(1, 0.5));
      add(this.add.text(right, y + ROW_H / 2 - 1, economy ? formatMoney(row.price, economy.currencyPrefix) : String(row.price), { ...TEXT.bold, fontSize: '18px', color: active ? UI.coin : UI.text }).setOrigin(1, 0.5));
      y += ROW_H;
    });
    if (this.rows.length > MAX_VISIBLE) add(this.add.text(right, y + 4, `${this.scroll + 1}-${Math.min(this.rows.length, this.scroll + MAX_VISIBLE)} of ${this.rows.length}`, TEXT.hint).setOrigin(1, 0));
  }

  protected onButton(b: OverlayButton): void {
    switch (b) {
      case 'up': if (this.rows.length) { this.selected = (this.selected + this.rows.length - 1) % this.rows.length; this.render(); } break;
      case 'down': if (this.rows.length) { this.selected = (this.selected + 1) % this.rows.length; this.render(); } break;
      case 'confirm': this.trade(); break;
      case 'cancel': this.close(); break;
      default: break;
    }
  }

  private trade(): void {
    const { project, state } = ctxOf(this);
    const economy = project.settings.economy;
    const row = this.rows[this.selected];
    if (!row || !economy) return;
    const label = variableLabel(project, row.variableId);
    const price = formatMoney(row.price, economy.currencyPrefix);
    if (row.kind === 'buy') {
      const r = buyItem(state, economy.moneyVariableId, row.variableId, row.price);
      this.setStatus(r.ok ? `Bought ${label} for ${price}.` : `Not enough money for ${label}.`, r.ok);
    } else {
      const r = sellItem(state, economy.moneyVariableId, row.variableId, row.price);
      this.setStatus(r.ok ? `Sold ${label} for ${price}.` : `You have no ${label} to sell.`, r.ok);
    }
    this.world.onVariablesChanged();
    this.render();
  }

  private setStatus(text: string, ok: boolean): void {
    AudioSystem.of(this)?.sfx(ok ? 'buy' : 'deny');
    this.status.setText(text).setColor(ok ? UI.good : UI.bad).setAlpha(1);
    this.tweens.killTweensOf(this.status);
    this.tweens.add({ targets: this.status, alpha: 0.4, duration: 600, delay: 1400 });
    if (!ok) this.cameras.main.shake(80, 0.002);
  }
}
