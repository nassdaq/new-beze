import Phaser from 'phaser';
import type { Action, Dialogue } from '@beze/project-schema';
import { ctxOf, KEYS, SCENE_KEYS } from '../context.js';
import { start, advance, type Step } from '../dialogue/interpreter.js';
import type { WorldScene } from './WorldScene.js';

const INTERACT_CODES = { E: Phaser.Input.Keyboard.KeyCodes.E, SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE, ENTER: Phaser.Input.Keyboard.KeyCodes.ENTER } as const;

/** Overlay that renders the current dialogue step and feeds input to the interpreter. */
export class DialogueScene extends Phaser.Scene {
  private dialogue!: Dialogue;
  private step!: Step;
  private pendingActions: Action[] = [];
  private selected = 0;
  private box!: Phaser.GameObjects.Rectangle;
  private speaker!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private portrait: Phaser.GameObjects.Image | null = null;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private advanceKeys: Phaser.Input.Keyboard.Key[] = [];
  private upKeys: Phaser.Input.Keyboard.Key[] = [];
  private downKeys: Phaser.Input.Keyboard.Key[] = [];

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
  }

  create(): void {
    const ctx = ctxOf(this);
    const { width, height } = this.scale;
    const boxH = Math.round(height * 0.34);
    const y = height - boxH - 6;
    this.box = this.add.rectangle(6, y, width - 12, boxH, 0x14121c, 0.92).setOrigin(0, 0).setStrokeStyle(2, 0xf2f2f2, 0.9);
    this.speaker = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#f6d365' });
    this.body = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff', lineSpacing: 3 });

    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = this.input.keyboard!;
    const codes = new Set<number>([INTERACT_CODES[ctx.project.settings.interactKey], K.SPACE, K.ENTER]);
    this.advanceKeys = [...codes].map((c) => kb.addKey(c));
    this.upKeys = [kb.addKey(K.UP), kb.addKey(K.W)];
    this.downKeys = [kb.addKey(K.DOWN), kb.addKey(K.S)];
    const onDown = (keys: Phaser.Input.Keyboard.Key[], fn: () => void) =>
      keys.forEach((k) => k.on('down', (_k: Phaser.Input.Keyboard.Key, ev: KeyboardEvent) => { if (!ev.repeat) fn(); }));
    onDown(this.upKeys, () => this.move(-1));
    onDown(this.downKeys, () => this.move(1));
    onDown(this.advanceKeys, () => this.next());

    ctx.emit({ type: 'dialogueStarted', dialogueId: this.dialogue.id });
    this.show(start(this.dialogue, ctx.state.variables));
  }

  private show(outcome: { step: Step; actions: Action[] }): void {
    this.pendingActions.push(...outcome.actions);
    this.step = outcome.step;
    this.selected = 0;
    for (const t of this.optionTexts) t.destroy();
    this.optionTexts = [];
    this.portrait?.destroy();
    this.portrait = null;

    if (this.step.kind === 'end') {
      this.close();
      return;
    }
    const pad = 10;
    let textX = this.box.x + pad;
    const textW = this.box.width - pad * 2;
    if (this.step.kind === 'line' && this.step.node.portraitAssetId) {
      const key = KEYS.image(this.step.node.portraitAssetId);
      if (this.textures.exists(key)) {
        const size = this.box.height - pad * 2;
        this.portrait = this.add.image(this.box.x + pad, this.box.y + pad, key).setOrigin(0, 0).setDisplaySize(size, size);
        textX += size + pad;
      }
    }
    const wrapW = this.box.x + textW + pad - textX;
    if (this.step.kind === 'line') {
      this.speaker.setText(this.step.node.speaker ?? '').setPosition(textX, this.box.y + pad);
      this.body.setText(this.step.node.text).setWordWrapWidth(wrapW).setPosition(textX, this.box.y + pad + (this.step.node.speaker ? 16 : 0));
    } else {
      this.speaker.setText('').setPosition(textX, this.box.y + pad);
      this.body.setText(this.step.node.prompt ?? '').setWordWrapWidth(wrapW).setPosition(textX, this.box.y + pad);
      let oy = this.body.y + (this.step.node.prompt ? this.body.height + 6 : 0);
      for (const o of this.step.options) {
        const t = this.add.text(textX + 10, oy, o.text, { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff' });
        this.optionTexts.push(t);
        oy += t.height + 4;
      }
      this.highlight();
    }
  }

  private highlight(): void {
    this.optionTexts.forEach((t, i) => t.setColor(i === this.selected ? '#f6d365' : '#ffffff').setText((i === this.selected ? '> ' : '  ') + (this.step.kind === 'choice' ? this.step.options[i]!.text : '')));
  }

  private move(delta: number): void {
    if (this.step.kind !== 'choice' || this.optionTexts.length === 0) return;
    this.selected = (this.selected + delta + this.optionTexts.length) % this.optionTexts.length;
    this.highlight();
  }

  private next(): void {
    if (!this.step || this.step.kind === 'end') return;
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
