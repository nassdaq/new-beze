import Phaser from 'phaser';
import type { Action, Dialogue } from '@beze/project-schema';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { start, advance, type Step } from '../dialogue/interpreter.js';
import { inputOf } from '../systems/input.js';
import { drawPanel, TEXT, UI } from '../ui/theme.js';
import type { WorldScene } from './WorldScene.js';

const INTERACT_CODES = { E: Phaser.Input.Keyboard.KeyCodes.E, SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER } as const;
/** Characters revealed per second by the typewriter. */
const TYPE_CPS = 55;

/**
 * The dialogue box: a rounded panel along the bottom with the speaker's portrait in a lit frame, a name tag, text
 * that types itself out (the advance key completes it, then moves on) and choices with a highlight bar. Slides up
 * on open; toasts and the mission panel move out of its way.
 */
export class DialogueScene extends Phaser.Scene {
  private dialogue!: Dialogue;
  private step!: Step;
  private pendingActions: Action[] = [];
  private selected = 0;
  private box!: Phaser.Geom.Rectangle;
  private panel!: Phaser.GameObjects.Graphics;
  private root!: Phaser.GameObjects.Container;
  private nameTag!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private nameBack!: Phaser.GameObjects.Graphics;
  private body!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Text;
  private portrait: Phaser.GameObjects.Image | null = null;
  private portraitFrame!: Phaser.GameObjects.Graphics;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private optionBar!: Phaser.GameObjects.Graphics;
  private fullText = '';
  private typed = 0;
  private typing = false;
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super(SCENE_KEYS.dialogue);
  }

  init(data: { dialogueId: string }): void {
    const ctx = ctxOf(this);
    const dialogue = ctx.project.dialogues[data.dialogueId];
    if (!dialogue) throw new Error(`dialogue "${data.dialogueId}" does not exist`);
    this.dialogue = dialogue;
    this.pendingActions = [];
    this.selected = 0;
    this.portrait = null;
    this.optionTexts = [];
    this.typing = false;
    this.typeTimer = null;
  }

  create(): void {
    const ctx = ctxOf(this);
    const { width, height } = this.scale;
    const boxH = Math.round(height * 0.36);
    const margin = 16;
    this.box = new Phaser.Geom.Rectangle(margin, height - boxH - 12, width - margin * 2, boxH);
    this.panel = this.add.graphics();
    drawPanel(this.panel, this.box.x, this.box.y, this.box.width, this.box.height, { radius: 16, alpha: 0.95 });
    this.portraitFrame = this.add.graphics();
    this.nameBack = this.add.graphics();
    this.nameText = this.add.text(0, 0, '', { ...TEXT.bold, fontSize: '17px', color: UI.accent });
    this.nameTag = this.add.container(0, 0, [this.nameBack, this.nameText]);
    this.body = this.add.text(0, 0, '', { ...TEXT.body, fontSize: '21px', lineSpacing: 6 });
    this.arrow = this.add.text(this.box.right - 22, this.box.bottom - 20, '▼', { ...TEXT.bold, fontSize: '16px', color: UI.accent }).setOrigin(0.5).setVisible(false);
    this.tweens.add({ targets: this.arrow, y: this.arrow.y + 4, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.optionBar = this.add.graphics();
    this.root = this.add.container(0, 0, [this.panel, this.portraitFrame, this.optionBar, this.body, this.arrow, this.nameTag]);
    this.root.setY(40).setAlpha(0);
    this.tweens.add({ targets: this.root, y: 0, alpha: 1, duration: 220, ease: 'Cubic.easeOut' });

    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = this.input.keyboard!;
    const codes = new Set<number>([INTERACT_CODES[ctx.project.settings.interactKey], K.SPACE, K.ENTER]);
    const onDown = (keyCodes: number[], fn: () => void) =>
      keyCodes.forEach((c) => kb.addKey(c).on('down', (_k: Phaser.Input.Keyboard.Key, ev: KeyboardEvent) => { if (!ev.repeat) fn(); }));
    onDown([K.UP, K.W], () => this.move(-1));
    onDown([K.DOWN, K.S], () => this.move(1));
    onDown([...codes], () => this.next());
    this.unsubscribe = inputOf(this).onPress((b) => {
      if (b === 'interact' || b === 'attack') this.next();
      else if (b === 'up') this.move(-1);
      else if (b === 'down') this.move(1);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.next());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.unsubscribe?.(); this.unsubscribe = null; this.typeTimer?.remove(false); });

    ctx.emit({ type: 'dialogueStarted', dialogueId: this.dialogue.id });
    this.show(start(this.dialogue, ctx.state.variables));
  }

  private show(outcome: { step: Step; actions: Action[] }): void {
    this.pendingActions.push(...outcome.actions);
    this.step = outcome.step;
    this.selected = 0;
    for (const t of this.optionTexts) t.destroy();
    this.optionTexts = [];
    this.optionBar.clear();
    this.portrait?.destroy();
    this.portrait = null;
    this.portraitFrame.clear();
    this.arrow.setVisible(false);
    this.typeTimer?.remove(false);
    this.typeTimer = null;

    if (this.step.kind === 'end') {
      this.close();
      return;
    }
    const pad = 18;
    let textX = this.box.x + pad;
    if (this.step.kind === 'line' && this.step.node.portraitAssetId) {
      const key = KEYS.image(this.step.node.portraitAssetId);
      if (this.textures.exists(key)) {
        const size = this.box.height - pad * 2;
        const px = this.box.x + pad; const py = this.box.y + pad;
        this.portraitFrame.fillStyle(0x000000, 0.5); this.portraitFrame.fillRoundedRect(px - 2, py, size + 4, size + 4, 12);
        this.portraitFrame.fillStyle(UI.panelSoft, 1); this.portraitFrame.fillRoundedRect(px - 2, py - 2, size + 4, size + 4, 12);
        this.portraitFrame.lineStyle(2, UI.accentInt, 0.9); this.portraitFrame.strokeRoundedRect(px - 2, py - 2, size + 4, size + 4, 12);
        this.portrait = this.add.image(px, py, key).setOrigin(0, 0).setDisplaySize(size, size);
        const mask = this.make.graphics({ x: 0, y: 0 }, false);
        mask.fillRoundedRect(px, py, size, size, 10);
        this.portrait.setMask(mask.createGeometryMask());
        this.root.addAt(this.portrait, 2);
        textX += size + pad + 4;
      }
    }
    const wrapW = this.box.right - pad - textX;
    if (this.step.kind === 'line') {
      const speaker = this.step.node.speaker ?? '';
      this.nameTag.setVisible(!!speaker);
      if (speaker) {
        this.nameText.setText(speaker).setPosition(14, 5);
        const w = this.nameText.width + 28; const h = 30;
        this.nameBack.clear();
        this.nameBack.fillStyle(0x000000, 0.45); this.nameBack.fillRoundedRect(1, 3, w, h, 8);
        this.nameBack.fillStyle(UI.panelSoft, 1); this.nameBack.fillRoundedRect(0, 0, w, h, 8);
        this.nameBack.lineStyle(1.5, UI.accentInt, 0.7); this.nameBack.strokeRoundedRect(0.75, 0.75, w - 1.5, h - 1.5, 8);
        this.nameTag.setPosition(textX - 6, this.box.y - 16);
      }
      this.body.setWordWrapWidth(wrapW).setPosition(textX, this.box.y + pad + 6);
      this.typewrite(this.step.node.text);
    } else {
      this.nameTag.setVisible(false);
      this.body.setText(this.step.node.prompt ?? '').setWordWrapWidth(wrapW).setPosition(textX, this.box.y + pad);
      let oy = this.body.y + (this.step.node.prompt ? this.body.height + 12 : 4);
      for (const o of this.step.options) {
        const t = this.add.text(textX + 26, oy, o.text, { ...TEXT.body, fontSize: '20px' });
        this.optionTexts.push(t);
        this.root.add(t);
        oy += t.height + 10;
      }
      this.highlight();
    }
  }

  private typewrite(text: string): void {
    this.fullText = text;
    this.typed = 0;
    this.typing = true;
    this.body.setText('');
    const tick = () => {
      if (!this.typing) return;
      this.typed = Math.min(this.fullText.length, this.typed + 1);
      this.body.setText(this.fullText.slice(0, this.typed));
      if (this.typed >= this.fullText.length) this.finishTyping();
    };
    this.typeTimer = this.time.addEvent({ delay: 1000 / TYPE_CPS, loop: true, callback: tick });
  }

  private finishTyping(): void {
    this.typing = false;
    this.typeTimer?.remove(false);
    this.typeTimer = null;
    this.body.setText(this.fullText);
    this.arrow.setVisible(true);
  }

  private highlight(): void {
    if (this.step.kind !== 'choice') return;
    this.optionBar.clear();
    this.optionTexts.forEach((t, i) => {
      const active = i === this.selected;
      t.setColor(active ? UI.accent : UI.text).setFontStyle(active ? '800' : '600');
      if (active) {
        this.optionBar.fillStyle(UI.accentInt, 0.12);
        this.optionBar.fillRoundedRect(t.x - 22, t.y - 5, this.box.right - 18 - (t.x - 22), t.height + 10, 8);
        this.optionBar.fillStyle(UI.accentInt, 1);
        this.optionBar.fillTriangle(t.x - 16, t.y + t.height / 2 - 7, t.x - 16, t.y + t.height / 2 + 7, t.x - 6, t.y + t.height / 2);
      }
    });
  }

  private move(delta: number): void {
    if (this.step.kind !== 'choice' || this.optionTexts.length === 0) return;
    this.selected = (this.selected + delta + this.optionTexts.length) % this.optionTexts.length;
    this.highlight();
  }

  private next(): void {
    if (!this.step || this.step.kind === 'end') return;
    if (this.typing) { this.finishTyping(); return; }
    const vars = ctxOf(this).state.variables;
    const choice = this.step.kind === 'choice' ? this.step.options[this.selected]?.index : undefined;
    this.show(advance(this.dialogue, this.step, vars, choice));
  }

  private close(): void {
    const ctx = ctxOf(this);
    const world = this.scene.get(SCENE_KEYS.world) as WorldScene;
    const followUps = this.pendingActions;
    this.pendingActions = [];
    ctx.emit({ type: 'dialogueEnded', dialogueId: this.dialogue.id });
    this.scene.stop();
    world.endDialogue(followUps);
  }
}
