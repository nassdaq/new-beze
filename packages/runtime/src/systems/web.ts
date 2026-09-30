import Phaser from 'phaser';
import type { Ability, TileMap } from '@beze/project-schema';
import { KEYS } from '../context.js';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { playIdle } from './animation.js';
import type { CombatSystem } from './combat.js';
import type { Effects } from './effects.js';
import { castWeb, type WebGrid, type WebTarget } from './webcast.js';

const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
/** Movement lock while the shooting pose plays (when the character has no web animation). */
const SHOOT_LOCK_MS = 180;
/** Zip travel speed and the stretch of the sprite while it flies. */
const ZIP_SPEED = 560;
const ZIP_MAX_MS = 900;
const HIT_STOP_MS = 40;

export interface WebHooks {
  /** A zip started; `ms` is how long it lasts. */
  onZip(ms: number): void;
  onFizzle(): void;
  sound?(name: 'web' | 'web_hit' | 'zip' | 'land'): void;
}

/**
 * The web ability: fire a line in the facing direction, web (stun) the first enemy it reaches, or zip to the wall
 * it sticks to. Also owns the "webbed" state of enemies: the cocoon graphic that follows them and the release when
 * the stun runs out. Melee hits on a webbed enemy deal double damage (see combat.ts).
 */
export class WebSystem {
  private nextAt = 0;
  private wraps = new Map<SpawnedEntity, Phaser.GameObjects.Graphics>();
  private zipTimer: Phaser.Time.TimerEvent | null = null;

  constructor(private scene: Phaser.Scene, private effects: Effects, private combat: CombatSystem, private hooks: WebHooks) {}

  /** Ready to fire (not on cooldown, not mid-swing or mid-zip). */
  ready(player: SpawnedEntity, now: number): boolean {
    return now >= this.nextAt && now >= player.attackUntil && now >= player.zipUntil && !player.defeated;
  }

  /** Milliseconds of cooldown left, for a HUD. */
  cooldownLeft(now: number): number {
    return Math.max(0, this.nextAt - now);
  }

  fire(player: SpawnedEntity, ability: Ability, entities: SpawnedEntity[], map: TileMap | null, now: number): boolean {
    const sprite = player.sprite;
    const body = sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!sprite || !body || !this.ready(player, now)) return false;
    this.nextAt = now + ability.cooldownMs;
    const T = map?.tileWidth ?? 32;
    const facing = player.facing;
    const [dx, dy] = DIR[facing];

    // Pose: the character's web_<facing> animation when it has one, else a short lock in the idle pose.
    const anim = webAnimation(player, facing);
    sprite.setVelocity(0, 0);
    if (anim) {
      player.attackUntil = now + anim.durationMs;
      sprite.play(anim.key);
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (!player.defeated && this.scene.time.now >= player.zipUntil) playIdle(player); });
    } else {
      player.attackUntil = now + SHOOT_LOCK_MS;
      playIdle(player);
    }

    const grid: WebGrid | null = map ? { width: map.width, height: map.height, tileSize: map.tileWidth, collision: map.collision } : null;
    const origin = { x: body.center.x, y: body.center.y };
    const targets: WebTarget<SpawnedEntity>[] = [];
    for (const e of entities) {
      if (!e.enemy || e.defeated || !e.sprite?.body) continue;
      const eb = e.sprite.body as Phaser.Physics.Arcade.Body;
      targets.push({ item: e, x: eb.x, y: eb.y, width: eb.width, height: eb.height });
    }
    const hit = castWeb(grid, origin, facing, ability.rangeTiles * T, targets, player.climb);
    this.hooks.sound?.('web');
    // The line leaves the hand at chest height.
    const handX = body.center.x + dx * body.width * 0.4;
    const handY = body.center.y - body.height * 0.6 + (dy > 0 ? body.height * 0.4 : 0);

    if (hit.kind === 'enemy') {
      const e = hit.target;
      this.effects.webLine(handX, handY, hit.x, hit.y, true);
      this.hooks.sound?.('web_hit');
      this.web(e, now + ability.stunMs);
      if (ability.damage > 0) this.combat.hurt(e, ability.damage, dx, dy, now, hit.x, hit.y);
      this.effects.hitStop(HIT_STOP_MS);
      player.attackUntil += HIT_STOP_MS;
      return true;
    }
    if (hit.kind === 'wall') {
      this.effects.webLine(handX, handY, hit.x, hit.y, true);
      if (ability.zip && hit.land) this.zip(player, hit.land, now, T, { x: hit.x, y: hit.y });
      return true;
    }
    this.effects.webLine(handX, handY, hit.x, hit.y, false);
    this.hooks.onFizzle();
    return true;
  }

  /** Webs an enemy: interrupts whatever it was doing, freezes it and cocoons it until `until`. */
  web(e: SpawnedEntity, until: number): void {
    if (!e.sprite || e.defeated || !e.enemy) return;
    this.combat.stun(e, until);
    let wrap = this.wraps.get(e);
    if (!wrap) {
      wrap = this.scene.add.graphics().setDepth(e.sprite.depth + 1);
      this.wraps.set(e, wrap);
    }
    const body = e.sprite.body as Phaser.Physics.Arcade.Body;
    const h = e.character?.frameHeight ?? body.height * 2;
    this.effects.drawWrap(wrap, Math.max(body.width + 8, 18), Math.min(h * 0.7, body.height + 22));
    wrap.setAlpha(1).setScale(1.3);
    this.scene.tweens.add({ targets: wrap, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.easeOut' });
    this.effects.webBurst(body.center.x, body.center.y - body.height / 2);
  }

  /** Frees a webbed enemy (stun over, despawned or defeated). */
  release(e: SpawnedEntity): void {
    const wrap = this.wraps.get(e);
    if (wrap) {
      this.scene.tweens.killTweensOf(wrap);
      this.scene.tweens.add({ targets: wrap, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 160, onComplete: () => wrap.destroy() });
      this.wraps.delete(e);
    }
    if (e.stunnedUntil > 0 && !e.defeated) this.combat.unstun(e);
    e.stunnedUntil = 0;
  }

  /** Keeps cocoons on their enemies and frees the ones whose stun ran out. */
  update(now: number): void {
    for (const [e, wrap] of this.wraps) {
      if (e.defeated || !e.sprite || now >= e.stunnedUntil) { this.release(e); continue; }
      const body = e.sprite.body as Phaser.Physics.Arcade.Body;
      wrap.setPosition(body.center.x, body.center.y - body.height * 0.4 + Math.sin(now / 90) * 0.6).setDepth(e.sprite.depth + 1);
    }
  }

  dispose(): void {
    for (const wrap of this.wraps.values()) wrap.destroy();
    this.wraps.clear();
    this.zipTimer?.remove(false);
    this.zipTimer = null;
  }

  /**
   * Swings the player to `land` (a body-centre target): a web line stays hooked to `anchor` while the sprite flies
   * along an arc (horizontal zips bow upward like a swing; vertical ones climb straight), tile collisions off for
   * the flight, invulnerable and locked out of input on the way.
   */
  private zip(player: SpawnedEntity, land: { x: number; y: number }, now: number, tileSize: number, anchor: { x: number; y: number }): void {
    const sprite = player.sprite!;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const vx = land.x - body.center.x;
    const vy = land.y - body.center.y;
    const dist = Math.hypot(vx, vy);
    if (dist < 2) return;
    const ms = Math.min(ZIP_MAX_MS, (dist / ZIP_SPEED) * 1000 + 60);
    player.zipUntil = now + ms;
    player.attackUntil = Math.min(player.attackUntil, now);
    player.invulnerableUntil = Math.max(player.invulnerableUntil, now + ms + 60);
    sprite.setVelocity(0, 0);
    body.checkCollision.none = true;
    const along = Math.abs(vx) > Math.abs(vy);
    sprite.setScale(along ? 1.18 : 0.9, along ? 0.86 : 1.18);
    this.effects.dust(body.center.x, body.bottom - 2, player.facing);
    this.hooks.sound?.('zip');
    this.hooks.onZip(ms);
    // The arc: bow upward for sideways swings (higher the longer the swing), a slight lean for vertical climbs.
    const start = new Phaser.Math.Vector2(sprite.x, sprite.y);
    const end = new Phaser.Math.Vector2(sprite.x + vx, sprite.y + vy);
    const sag = along ? -Math.min(tileSize * 2.2, dist * 0.45) : (vx >= 0 ? 1 : -1) * tileSize * 0.3;
    const control = new Phaser.Math.Vector2((start.x + end.x) / 2 + (along ? 0 : sag), (start.y + end.y) / 2 + (along ? sag : 0));
    const curve = new Phaser.Curves.QuadraticBezier(start, control, end);
    const line = this.scene.add.graphics().setDepth(15_000);
    const state = { t: 0 };
    const tween = this.scene.tweens.add({
      targets: state, t: 1, duration: ms, ease: along ? 'Sine.easeInOut' : 'Quad.easeOut',
      onUpdate: () => {
        if (player.defeated || !player.sprite) { tween.stop(); return; }
        const p = curve.getPoint(state.t);
        player.sprite.setPosition(p.x, p.y);
        player.sprite.setAngle(along ? Math.sin(state.t * Math.PI) * (vx > 0 ? 10 : -10) : 0);
        const b = player.sprite.body as Phaser.Physics.Arcade.Body;
        line.clear();
        line.lineStyle(4, 0x9fd7ff, 0.25); line.lineBetween(b.center.x, b.center.y - b.height * 0.6, anchor.x, anchor.y);
        line.lineStyle(2, 0xffffff, 0.95); line.lineBetween(b.center.x, b.center.y - b.height * 0.6, anchor.x, anchor.y);
      },
    });
    this.zipTimer?.remove(false);
    this.zipTimer = this.scene.time.delayedCall(ms, () => {
      this.zipTimer = null;
      line.destroy();
      if (player.defeated || !player.sprite) return;
      const b = player.sprite.body as Phaser.Physics.Arcade.Body;
      b.checkCollision.none = false;
      player.sprite.setVelocity(0, 0);
      player.sprite.setScale(1).setAngle(0);
      player.zipUntil = 0;
      // Settle exactly on the target cell.
      player.sprite.setPosition(player.sprite.x + (land.x - b.center.x), player.sprite.y + (land.y - b.center.y));
      this.effects.dust(b.center.x, b.bottom - 2, player.facing);
      this.hooks.sound?.('land');
      // A landing crouch when the character has one, then back to idle.
      const crouch = player.character?.animations['crouch'] ? KEYS.animation(player.character.id, 'crouch') : null;
      if (crouch && player.facing === 'down') {
        player.attackUntil = Math.max(player.attackUntil, this.scene.time.now + 160);
        player.sprite.play(crouch);
        this.scene.time.delayedCall(160, () => { if (!player.defeated && player.sprite) playIdle(player); });
      } else playIdle(player);
    });
  }
}

/** `web_<facing>` when the character has it (rendered as an extra directional set), timed like an attack animation. */
function webAnimation(e: SpawnedEntity, facing: SpawnedEntity['facing']): { key: string; durationMs: number } | null {
  const c = e.character;
  const def = c?.animations[`web_${facing}`];
  if (!c || !def || def.frames.length === 0) return null;
  return { key: KEYS.animation(c.id, `web_${facing}`), durationMs: (def.frames.length / def.frameRate) * 1000 };
}
